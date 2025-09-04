const fetch = require('node-fetch');

module.exports = async function (context, req) {
    context.log('HTTP trigger function processed a request for create-checkout-session.');

    const { userId, amount, purpose, messageId, sponsoredBy, duration, messageContent } = req.body;
    if (!userId || !amount || !purpose) {
        context.res = {
            status: 400,
            body: { error: "Missing required fields: userId, amount, and purpose are required." }
        };
        return;
    }

    if (!['message_sponsorship', 'joy_token_purchase'].includes(purpose)) {
        context.res = {
            status: 400,
            body: { error: `Invalid purpose: ${purpose}. Must be 'message_sponsorship' or 'joy_token_purchase'.` }
        };
        return;
    }

    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalSecret = process.env.PAYPAL_SECRET;
    const PAYPAL_API_BASE_URL = 'https://api-m.paypal.com';

    if (!paypalClientId || !paypalSecret) {
        context.log.error('PayPal API credentials are not configured.');
        context.res = {
            status: 500,
            body: { error: 'PayPal API credentials are not configured.' }
        };
        return;
    }

    try {
        const authString = Buffer.from(`${paypalClientId}:${paypalSecret}`).toString('base64');
        const tokenResponse = await fetch(`${PAYPAL_API_BASE_URL}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authString}`
            },
            body: 'grant_type=client_credentials'
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
            context.log.error('Error getting PayPal access token:', tokenData.error_description);
            context.res = {
                status: 500,
                body: { error: `Failed to obtain PayPal access token: ${tokenData.error_description}` }
            };
            return;
        }
        const accessToken = tokenData.access_token;

        const orderData = {
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: 'USD',
                    value: amount.toFixed(2)
                },
                description: `Gratitude Loop - ${purpose}`,
                custom_id: JSON.stringify({
                    userId,
                    purpose,
                    messageId: messageId || null,
                    sponsoredBy: sponsoredBy || null,
                    duration: duration || null,
                    messageContent: messageContent || null
                })
            }],
            application_context: {
                return_url: 'https://your-app.com/payment-success',
                cancel_url: 'https://your-app.com/payment-cancel',
                brand_name: 'The Gratitude Loop',
                shipping_preference: 'NO_SHIPPING'
            }
        };

        const orderResponse = await fetch(`${PAYPAL_API_BASE_URL}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(orderData)
        });

        const orderResult = await orderResponse.json();
        if (orderResult.id && orderResult.links) {
            const redirectLink = orderResult.links.find(link => link.rel === 'approve');
            context.res = {
                status: 200,
                body: { redirectUrl: redirectLink.href }
            };
        } else {
            context.log.error('Error creating PayPal order:', orderResult);
            context.res = {
                status: 500,
                body: { error: orderResult.message || 'Failed to create PayPal order.' }
            };
        }
    } catch (error) {
        context.log.error('Exception in create-checkout-session:', error);
        context.res = {
            status: 500,
            body: { error: `Server error: ${error.message}` }
        };
    }
};

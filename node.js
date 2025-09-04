// create-checkout-session/index.js
const fetch = require('node-fetch');

module.exports = async function (context, req) {
    context.log('HTTP trigger function processed a request for create-checkout-session.');

    // Validate request body
    const { userId, amount, purpose, messageId, sponsoredBy, duration, messageContent } = req.body;
    if (!userId || !amount || !purpose) {
        context.res = {
            status: 400,
            body: { error: "Missing required fields: userId, amount, and purpose are required." }
        };
        return;
    }

    // Validate purpose
    if (!['message_sponsorship', 'joy_token_purchase'].includes(purpose)) {
        context.res = {
            status: 400,
            body: { error: `Invalid purpose: ${purpose}. Must be 'message_sponsorship' or 'joy_token_purchase'.` }
        };
        return;
    }

    // PayPal live credentials (set in Azure Function App settings)
    const ATiXfgm2Zep5s4pV8zV47uzpY9neY7YFe8QXaSk7_ImnKUVG3QSDz11JaEMKlo17EWCeRUMcKRHcZvZp = process.env.ATiXfgm2Zep5s4pV8zV47uzpY9neY7YFe8QXaSk7_ImnKUVG3QSDz11JaEMKlo17EWCeRUMcKRHcZvZp;
    const EATYbbTxP8ApfsbjBzVqQoP0EPkCb-a9EYvP1VesLyNGCBM2vxNYaI3i4eX-zy8Sqmig1XrjaH6q20Dx = process.env.EATYbbTxP8ApfsbjBzVqQoP0EPkCb-a9EYvP1VesLyNGCBM2vxNYaI3i4eX-zy8Sqmig1XrjaH6q20Dx;
    const PAYPAL_API_BASE_URL = 'https://api-m.paypal.com'; // Live PayPal API

    if (!ATiXfgm2Zep5s4pV8zV47uzpY9neY7YFe8QXaSk7_ImnKUVG3QSDz11JaEMKlo17EWCeRUMcKRHcZvZp || !EATYbbTxP8ApfsbjBzVqQoP0EPkCb-a9EYvP1VesLyNGCBM2vxNYaI3i4eX-zy8Sqmig1XrjaH6q20Dx) {
        context.log.error('PayPal API credentials are not configured.');
        context.res = {
            status: 500,
            body: { error: 'PayPal API credentials are not configured.' }
        };
        return;
    }

    try {
        // 1. Get PayPal Access Token
        const authString = Buffer.from(`${ATiXfgm2Zep5s4pV8zV47uzpY9neY7YFe8QXaSk7_ImnKUVG3QSDz11JaEMKlo17EWCeRUMcKRHcZvZp}:${EATYbbTxP8ApfsbjBzVqQoP0EPkCb-a9EYvP1VesLyNGCBM2vxNYaI3i4eX-zy8Sqmig1XrjaH6q20Dx}`).toString('base64');
        const tokenResponse = await fetch(`${https://api-m.paypal.com/v1/payments/payment}/v1/oauth2/token`, {
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

        // 2. Create PayPal Order
        const orderData = {
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: 'USD',
                    value: amount.toFixed(2) // Amount in dollars
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
                return_url: 'https://your-app.com/payment-success', // REPLACE with your live success URL
                cancel_url: 'https://your-app.com/payment-cancel', // REPLACE with your live cancel URL
                brand_name: 'The Gratitude Loop',
                shipping_preference: 'NO_SHIPPING'
            }
        };

        const orderResponse = await fetch(`${https://api-m.paypal.com/v1/payments/payment}/v2/checkout/orders`, {
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

// paypal-webhook/index.js
const fetch = require('node-fetch');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = admin.firestore();

// PayPal webhook signature verification
async function verifyWebhookSignature(req, paypalApiBaseUrl, webhookId, paypalClientId, paypalSecret) {
    const headers = req.headers;
    const expectedSignature = headers['paypal-auth-algo'] + '|' + headers['paypal-cert-url'] + '|' + headers['paypal-transmission-id'] + '|' + headers['paypal-transmission-time'] + '|' + webhookId + '|' + crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

    try {
        const tokenResponse = await fetch(`${https://api-m.paypal.com/v1/payments/payment}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${paypalClientId}:${paypalSecret}`).toString('base64')}`
            },
            body: 'grant_type=client_credentials'
        });
        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            throw new Error(`Failed to obtain PayPal access token: ${tokenData.error_description || 'Unknown error'}`);
        }
        const accessToken = tokenData.access_token;

        const verifyResponse = await fetch(`${https://api-m.paypal.com/v1/payments/payment}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                auth_algo: headers['paypal-auth-algo'],
                cert_url: headers['paypal-cert-url'],
                transmission_id: headers['paypal-transmission-id'],
                transmission_time: headers['paypal-transmission-time'],
                webhook_id: webhookId,
                webhook_event: req.body
            })
        });
        const verifyResult = await verifyResponse.json();
        return verifyResult.verification_status === 'SUCCESS';
    } catch (error) {
        throw new Error(`Webhook verification failed: ${error.message}`);
    }
}

module.exports = async function (context, req) {
    context.log('HTTP trigger function processed a PayPal webhook request.');

    // PayPal live credentials
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const paypalApiBaseUrl = 'https://api-m.paypal.com'; // Live PayPal API
    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalSecret = process.env.PAYPAL_SECRET;

    if (!webhookId || !paypalClientId || !paypalSecret) {
        context.log.error('PayPal webhook ID or credentials not configured.');
        context.res = { status: 500, body: 'PayPal webhook ID or credentials not configured.' };
        return;
    }

    try {
        // Verify webhook signature
        const isValid = await verifyWebhookSignature(req, paypalApiBaseUrl, webhookId, paypalClientId, paypalSecret);
        if (!isValid) {
            context.log.error('PayPal webhook signature verification failed.');
            context.res = { status: 401, body: 'Invalid webhook signature.' };
            return;
        }

        const event = req.body;
        context.log('PayPal Webhook Event Type:', event.event_type);

        if (event.event_type === 'CHECKOUT.ORDER.COMPLETED') {
            const customId = event.resource.purchase_units[0].payments.captures[0].custom_id;
            let metadata;
            try {
                metadata = JSON.parse(customId);
            } catch (e) {
                context.log.error('Failed to parse custom_id metadata:', customId, e);
                context.res = { status: 400, body: 'Invalid metadata format.' };
                return;
            }
            const { userId, purpose, messageId, sponsoredBy, duration } = metadata;

            if (!userId || !purpose) {
                context.log.error('Missing userId or purpose in metadata:', metadata);
                context.res = { status: 400, body: 'Missing userId or purpose in metadata.' };
                return;
            }

            try {
                switch (purpose) {
                    case 'message_sponsorship':
                        if (messageId) {
                            await db.collection('messages').doc(messageId).update({
                                isSponsored: true,
                                sponsoredBy: sponsoredBy || 'Anonymous Sponsor',
                                sponsoredDuration: duration || 24,
                                sponsoredAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            context.log(`Message ${messageId} marked as sponsored.`);
                        } else {
                            context.log.error('Missing messageId for message_sponsorship:', metadata);
                            context.res = { status: 400, body: 'Missing messageId for message_sponsorship.' };
                            return;
                        }
                        break;
                    case 'joy_token_purchase':
                        if (userId) {
                            const tokensToAdd = event.resource.purchase_units[0].amount.value * 10; // $1 = 10 tokens
                            await db.collection('users').doc(userId).update({
                                joyTokens: admin.firestore.FieldValue.increment(tokensToAdd)
                            });
                            context.log(`User ${userId} received ${tokensToAdd} Joy Tokens.`);
                        } else {
                            context.log.error('Missing userId for joy_token_purchase:', metadata);
                            context.res = { status: 400, body: 'Missing userId for joy_token_purchase.' };
                            return;
                        }
                        break;
                    default:
                        context.log.error(`Unhandled purpose: ${purpose}`);
                        context.res = { status: 400, body: `Invalid purpose: ${purpose}` };
                        return;
                }
                context.res = { status: 200, body: 'Webhook processed successfully.' };
            } catch (error) {
                context.log.error('Error updating Firestore:', error);
                context.res = { status: 500, body: `Failed to process webhook: ${error.message}` };
            }
        } else {
            context.res = { status: 200, body: `Event type not handled: ${event.event_type}` };
        }
    } catch (error) {
        context.log.error('Exception in webhook processing:', error);
        context.res = { status: 500, body: `Webhook processing error: ${error.message}` };
    }
};

const fetch = require('node-fetch');
const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = admin.firestore();

async function verifyWebhookSignature(req, paypalApiBaseUrl, webhookId, paypalClientId, paypalSecret) {
    const headers = req.headers;
    const expectedSignature = headers['paypal-auth-algo'] + '|' + headers['paypal-cert-url'] + '|' + headers['paypal-transmission-id'] + '|' + headers['paypal-transmission-time'] + '|' + webhookId + '|' + crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

    try {
        const tokenResponse = await fetch(`${paypalApiBaseUrl}/v1/oauth2/token`, {
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

        const verifyResponse = await fetch(`${paypalApiBaseUrl}/v1/notifications/verify-webhook-signature`, {
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

    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const paypalApiBaseUrl = 'https://api-m.paypal.com';
    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalSecret = process.env.PAYPAL_SECRET;

    if (!webhookId || !paypalClientId || !paypalSecret) {
        context.log.error('PayPal webhook ID or credentials not configured.');
        context.res = { status: 500, body: 'PayPal webhook ID or credentials not configured.' };
        return;
    }

    try {
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
                context途中
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
                            const tokensToAdd = event.resource.purchase_units[0].amount.value * 10;
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

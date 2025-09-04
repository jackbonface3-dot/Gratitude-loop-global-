// main.js - This file contains the complete client-side JavaScript logic for The Gratitude Loop application.
// It includes Firebase integration, event listeners, and client-side payment initiation,
// incorporating refinements for performance and structure.

// ==========================================================
// 1. Firebase Configuration and Initialization
//    (Replace with your actual Firebase project configuration)
// ==========================================================
const firebaseConfig = {
    apiKey: "AlzaSyAyYDfiZmVe36MZIMp8VszskvM8vrowNXw",
    authDomain: "gratitude-loop.firebaseapp.com",
    projectId: "gratitude-loop",
    storageBucket: "gratitude-loop.firebasestorage.app",
    messagingSenderId: "434392316386",
    appId: "1:434392316386:web:50f914ac9baf9d743561bb"
    // measurementId: "G-J8CHB2CD5H" // Optional, if using Google Analytics
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null; // To store the current authenticated user

// ==========================================================
// 2. User Authentication (Anonymous)
// ==========================================================
auth.signInAnonymously()
    .then(() => {
        console.log('Signed in anonymously');
    })
    .catch((error) => {
        console.error("Error signing in anonymously:", error.message);
    });

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        console.log('User is signed in:', user.uid);
        // Fetch user data and initialize UI components dependent on user
        fetchUserData(user.uid);
        loadMessages(); // Load global messages
        loadSavedMessages(user.uid); // Load user-specific saved messages
        loadAffirmationPacks(); // Load available affirmation packs
    } else {
        currentUser = null;
        console.log('User is signed out.');
        // Handle signed out state, e.g., clear UI
    }
});

// ==========================================================
// 3. Core Application Data Functions
// ==========================================================

/**
 * Fetches and displays user-specific data like Joy Token balance.
 * @param {string} userId The ID of the current user.
 */
async function fetchUserData(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            document.getElementById('joy-token-balance').textContent = `Current Balance: ${userData.joyTokens || 0} Joy Tokens`;
        } else {
            // Create user document if it doesn't exist
            await db.collection('users').doc(userId).set({
                joyTokens: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            document.getElementById('joy-token-balance').textContent = `Current Balance: 0 Joy Tokens`;
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
    }
}

/**
 * Loads and displays anonymous gratitude messages in the feed.
 */
function loadMessages() {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = 'Loading messages...'; // Clear and show loading state

    db.collection('messages')
        .where('isApproved', '==', true) // Only show approved messages
        .orderBy('timestamp', 'desc')
        .limit(20) // Limit to latest 20 messages
        .onSnapshot((snapshot) => {
            messagesContainer.innerHTML = ''; // Clear previous messages
            snapshot.forEach((doc) => {
                const message = doc.data();
                const messageId = doc.id;
                const timestamp = message.timestamp ? message.timestamp.toDate().toLocaleString() : 'N/A';
                const sponsoredByText = message.isSponsored ? `Sponsored by ${message.sponsoredBy || 'Anonymous Sponsor'}` : '';

                const messageCard = `
                    <div class="message-card ${message.isSponsored ? 'sponsored' : ''}" role="article" aria-labelledby="message-${messageId}-content">
                        <p id="message-${messageId}-content">${message.content}</p>
                        <div class="message-meta">Sent by Anonymous on ${timestamp} ${sponsoredByText}</div>
                        <button class="save-message-btn" data-message-id="${messageId}" aria-label="Save this message">Save</button>
                        <button class="reply-message-btn" data-message-id="${messageId}" aria-label="Reply to this message">Reply</button>
                    </div>
                `;
                messagesContainer.innerHTML += messageCard;
            });

            // Re-attach event listeners for dynamically added buttons
            attachDynamicMessageEventListeners();
        }, (error) => {
            console.error("Error loading messages:", error);
            messagesContainer.innerHTML = 'Failed to load messages.';
        });
}

/**
 * Loads and displays messages saved by the current user.
 * @param {string} userId The ID of the current user.
 */
function loadSavedMessages(userId) {
    const savedMessagesContainer = document.getElementById('saved-messages-container');
    savedMessagesContainer.innerHTML = 'Loading saved messages...';

    db.collection('users').doc(userId).collection('savedMessages')
        .orderBy('savedAt', 'desc')
        .onSnapshot((snapshot) => {
            savedMessagesContainer.innerHTML = '';
            if (snapshot.empty) {
                savedMessagesContainer.innerHTML = '<p>No messages saved yet.</p>';
                return;
            }
            snapshot.forEach((doc) => {
                const savedMessage = doc.data();
                const originalTimestamp = savedMessage.originalTimestamp ? savedMessage.originalTimestamp.toDate().toLocaleString() : 'N/A';

                const savedMessageCard = `
                    <div class="saved-message-card" role="article" aria-labelledby="saved-message-${doc.id}-content">
                        <p id="saved-message-${doc.id}-content">${savedMessage.content}</p>
                        <div class="message-meta">Original: Anonymous on ${originalTimestamp}</div>
                    </div>
                `;
                savedMessagesContainer.innerHTML += savedMessageCard;
            });
        }, (error) => {
            console.error("Error loading saved messages:", error);
            savedMessagesContainer.innerHTML = 'Failed to load saved messages.';
        });
}

/**
 * Loads and displays available affirmation packs.
 */
function loadAffirmationPacks() {
    const affirmationPacksContainer = document.getElementById('affirmation-packs-container');
    affirmationPacksContainer.innerHTML = 'Loading affirmation packs...';

    db.collection('affirmationPacks')
        .orderBy('price', 'asc')
        .onSnapshot((snapshot) => {
            affirmationPacksContainer.innerHTML = '';
            snapshot.forEach((doc) => {
                const pack = doc.data();
                const packId = doc.id;

                const packCard = `
                    <div class="affirmation-pack-card" role="group" aria-labelledby="pack-${packId}-title">
                        <h3 id="pack-${packId}-title">${pack.name}</h3>
                        <p>${pack.description}</p>
                        <button class="unlock-pack-btn" data-pack-id="${packId}" data-pack-price="${pack.price}" aria-label="Unlock ${pack.name} for ${pack.price} Joy Tokens">Unlock (${pack.price} Joy Tokens)</button>
                    </div>
                `;
                affirmationPacksContainer.innerHTML += packCard;
            });
        }, (error) => {
            console.error("Error loading affirmation packs:", error);
            affirmationPacksContainer.innerHTML = 'Failed to load affirmation packs.';
        });
}

/**
 * Updates the Joy Token balance displayed on the UI.
 * @param {number} newBalance The new Joy Token balance.
 */
function updateJoyTokenBalance(newBalance) {
    document.getElementById('joy-token-balance').textContent = `Current Balance: ${newBalance} Joy Tokens`;
}

// ==========================================================
// 4. Event Listeners and User Interactions
// ==========================================================

// --- Send Gratitude Message ---
document.getElementById('send-message-btn').addEventListener('click', async () => {
    if (!currentUser) {
        alert('Please wait, signing in...');
        return;
    }

    const messageContent = document.getElementById('gratitude-message').value.trim();
    if (!messageContent) {
        alert('Please enter a message before sending.');
        return;
    }

    const isSponsored = document.getElementById('sponsor-message').checked;
    let sponsoredBy = '';
    let sponsorshipDuration = 0;
    let paymentAmount = 0;

    if (isSponsored) {
        sponsoredBy = document.getElementById('sponsored-by-name').value.trim();
        sponsorshipDuration = parseInt(document.getElementById('sponsorship-duration').value);
        if (sponsorshipDuration === 24) paymentAmount = 5;
        else if (sponsorshipDuration === 48) paymentAmount = 8;
        else if (sponsorshipDuration === 72) paymentAmount = 10;

        const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

        if (paymentMethod === 'credit_debit') {
            const cardNumber = document.getElementById('card-number').value.trim();
            const expiryDate = document.getElementById('expiry-date').value.trim();
            const cvv = document.getElementById('cvv').value.trim();

            if (!cardNumber || !expiryDate || !cvv) {
                alert('Please fill in all card details.');
                return;
            }
            // In a real app, this would integrate with a secure payment gateway (Stripe, Braintree, etc.)
            // The card details should NEVER be sent directly to your server/Firebase without tokenization.
            alert('Credit/Debit card processing is simulated. In production, use a secure payment gateway.');

            // Proceed with message sending and sponsorship after simulated payment success
            await sendMessageAndSponsor(messageContent, true, sponsoredBy, sponsorshipDuration, paymentAmount);

        } else if (paymentMethod === 'paypal') {
            // Initiate PayPal checkout (redirect to PayPal)
            try {
                // The 'create-checkout-session' should be an Azure Function or similar backend endpoint
                const response = await fetch('/api/create-checkout-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        userId: currentUser.uid,
                        amount: paymentAmount,
                        purpose: 'message_sponsorship',
                        messageContent: messageContent, // Pass content to identify later
                        sponsoredBy: sponsoredBy,
                        duration: sponsorshipDuration
                    })
                });

                const session = await response.json();
                if (session.error) {
                    alert(`Error creating PayPal checkout session: ${session.error}`);
                    return;
                }
                if (session.redirectUrl) {
                    window.location.href = session.redirectUrl; // Redirect to PayPal
                } else {
                    alert('PayPal payment session created. Please complete the payment.');
                }
            } catch (error) {
                console.error("Error initiating PayPal checkout:", error);
                alert("Failed to initiate PayPal payment.");
            }
        } else if (paymentMethod === 'google_pay') {
            alert('Initiating Google Pay... (Requires Google Pay API integration)');
            // Placeholder for Google Pay integration:
            // You would typically use Google Pay's JS API here, which talks to a payment gateway
            // e.g., payments.api.PaymentsClient.loadPaymentData(paymentRequest)
            try {
                // This would trigger a Google Pay sheet/modal
                // Once successful, you'd send the token to your backend
                const response = await fetch('/api/process-google-pay', { // Example backend endpoint
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        userId: currentUser.uid,
                        amount: paymentAmount,
                        purpose: 'message_sponsorship',
                        messageContent: messageContent,
                        sponsoredBy: sponsoredBy,
                        duration: sponsorshipDuration,
                        // paymentToken: 'GOOGLE_PAY_TOKEN_FROM_CLIENT_SDK' // This token would come from client-side Google Pay SDK
                    })
                });

                const result = await response.json();
                if (result.success) {
                    alert('Google Pay payment successful!');
                    await sendMessageAndSponsor(messageContent, true, sponsoredBy, sponsorshipDuration, paymentAmount);
                } else {
                    alert(`Google Pay payment failed: ${result.error}`);
                }
            } catch (error) {
                console.error("Error with Google Pay:", error);
                alert("Failed to process Google Pay payment.");
            }

        } else if (paymentMethod === 'apple_pay') {
            alert('Initiating Apple Pay... (Requires Apple Pay JS API integration)');
            // Placeholder for Apple Pay integration:
            // This would typically involve checking for Apple Pay availability, creating a session, etc.
            // e.g., const session = new ApplePaySession(1, { /* payment request */ }); session.begin();
            try {
                // This would trigger an Apple Pay sheet/modal
                // Once successful, you'd send the token to your backend
                const response = await fetch('/api/process-apple-pay', { // Example backend endpoint
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        userId: currentUser.uid,
                        amount: paymentAmount,
                        purpose: 'message_sponsorship',
                        messageContent: messageContent,
                        sponsoredBy: sponsoredBy,
                        duration: sponsorshipDuration,
                        // paymentToken: 'APPLE_PAY_TOKEN_FROM_CLIENT_SDK' // This token would come from client-side Apple Pay JS
                    })
                });

                const result = await response.json();
                if (result.success) {
                    alert('Apple Pay payment successful!');
                    await sendMessageAndSponsor(messageContent, true, sponsoredBy, sponsorshipDuration, paymentAmount);
                } else {
                    alert(`Apple Pay payment failed: ${result.error}`);
                }
            } catch (error) {
                console.error("Error with Apple Pay:", error);
                alert("Failed to process Apple Pay payment.");
            }
        }
    } else {
        // Send message without sponsorship
        await sendMessageAndSponsor(messageContent, false);
    }
});

/**
 * Handles sending a message to Firestore, with or without sponsorship.
 * @param {string} content The message content.
 * @param {boolean} isSponsored Whether the message is sponsored.
 * @param {string} [sponsoredBy=''] The name of the sponsor (if sponsored).
 * @param {number} [duration=0] The sponsorship duration in hours (if sponsored).
 * @param {number} [amount=0] The payment amount (if sponsored).
 */
async function sendMessageAndSponsor(content, isSponsored, sponsoredBy = '', duration = 0, amount = 0) {
    try {
        await db.collection('messages').add({
            content: content,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            isApproved: false, // Messages need moderation before appearing in public feed
            isSponsored: isSponsored,
            sponsoredBy: sponsoredBy,
            sponsoredDuration: duration,
            sponsoredAmount: amount, // For tracking purposes
            senderId: currentUser.uid // Track sender for internal use, though messages are anonymous in feed
        });
        document.getElementById('gratitude-message').value = ''; // Clear textarea
        document.getElementById('sponsor-message').checked = false;
        document.getElementById('sponsored-by-name').value = '';
        document.getElementById('sponsorship-duration').value = '24';
        document.getElementById('card-number').value = '';
        document.getElementById('expiry-date').value = '';
        document.getElementById('cvv').value = '';
        document.getElementById('card-details-form').style.display = 'none'; // Hide form

        alert('Message sent! It will appear in the feed after moderation.');
    } catch (error) {
        console.error("Error sending message:", error);
        alert("Failed to send message. Please try again.");
    }
}

// --- Purchase Joy Tokens ---
document.getElementById('purchase-tokens-btn').addEventListener('click', async () => {
    if (!currentUser) {
        alert('Please wait, signing in...');
        return;
    }
    const amount = parseInt(document.getElementById('purchase-tokens-amount').value);
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount of tokens.');
        return;
    }

    const dollars = amount / 10; // $1 = 10 Tokens

    try {
        // This would also go through the payment method selection
        const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

        // Backend endpoint for creating checkout sessions (re-used for tokens)
        const backendEndpoint = '/api/create-checkout-session'; // Or specific /api/process-payment for mobile wallets

        let requestBody = {
            userId: currentUser.uid,
            amount: dollars,
            purpose: 'joy_token_purchase',
            tokensToAdd: amount
        };

        if (paymentMethod === 'paypal') {
            const response = await fetch(backendEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const session = await response.json();
            if (session.error) {
                alert(`Error creating PayPal checkout session: ${session.error}`);
                return;
            }
            if (session.redirectUrl) {
                window.location.href = session.redirectUrl;
            } else {
                alert('Payment session created. Please complete the payment.');
            }
        } else if (paymentMethod === 'google_pay') {
             alert('Initiating Google Pay for tokens... (Requires Google Pay API integration)');
             // Similar to sponsorship payment, you'd integrate Google Pay SDK here
             const response = await fetch('/api/process-google-pay', { // Example backend endpoint
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
             });
             const result = await response.json();
             if (result.success) {
                 alert('Google Pay token purchase successful!');
                 fetchUserData(currentUser.uid); // Refresh tokens
             } else {
                 alert(`Google Pay purchase failed: ${result.error}`);
             }
        } else if (paymentMethod === 'apple_pay') {
             alert('Initiating Apple Pay for tokens... (Requires Apple Pay JS API integration)');
             // Similar to sponsorship payment, you'd integrate Apple Pay JS here
             const response = await fetch('/api/process-apple-pay', { // Example backend endpoint
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
             });
             const result = await response.json();
             if (result.success) {
                 alert('Apple Pay token purchase successful!');
                 fetchUserData(currentUser.uid); // Refresh tokens
             } else {
                 alert(`Apple Pay purchase failed: ${result.error}`);
             }
        } else if (paymentMethod === 'credit_debit') {
            // For credit/debit card, you'd have a separate form for token purchase or re-use card details form
            alert('Credit/Debit card processing for tokens is simulated. In production, use a secure payment gateway.');
            // After simulated success, update tokens
            try {
                await db.collection('users').doc(currentUser.uid).update({
                    joyTokens: firebase.firestore.FieldValue.increment(amount)
                });
                updateJoyTokenBalance( (await db.collection('users').doc(currentUser.uid).get()).data().joyTokens );
                alert(`${amount} Joy Tokens purchased successfully!`);
            } catch (error) {
                console.error("Error adding tokens:", error);
                alert("Failed to add tokens.");
            }
        }


    } catch (error) {
        console.error("Error purchasing tokens:", error);
        alert("Failed to initiate token purchase.");
    }
});

// --- Unlock Affirmation Pack ---
// Using event delegation for dynamically added unlock buttons
document.getElementById('affirmation-packs-container').addEventListener('click', async (event) => {
    if (!currentUser) {
        alert('Please wait, signing in...');
        return;
    }
    if (event.target.classList.contains('unlock-pack-btn')) {
        const packId = event.target.dataset.packId;
        const packPrice = parseInt(event.target.dataset.packPrice);

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const userData = userDoc.data();
            const currentTokens = userData.joyTokens || 0;

            if (currentTokens >= packPrice) {
                // Deduct tokens and mark pack as unlocked
                await db.collection('users').doc(currentUser.uid).update({
                    joyTokens: firebase.firestore.FieldValue.increment(-packPrice),
                    [`unlockedPacks.${packId}`]: true // Mark as unlocked
                });
                updateJoyTokenBalance(currentTokens - packPrice);
                alert(`"${(await db.collection('affirmationPacks').doc(packId).get()).data().name}" unlocked successfully!`);
                // Optionally, update the UI to show the pack as 'unlocked' or remove the button
            } else {
                alert(`Not enough Joy Tokens. You need ${packPrice - currentTokens} more tokens.`);
            }
        } catch (error) {
            console.error("Error unlocking affirmation pack:", error);
            alert("Failed to unlock pack. Please try again.");
        }
    }
});

// --- Save/Reply Message Buttons (Event Delegation) ---
document.getElementById('messages-container').addEventListener('click', async (event) => {
    if (!currentUser) {
        alert('Please wait, signing in...');
        return;
    }
    const messageId = event.target.dataset.messageId;

    if (event.target.classList.contains('save-message-btn') && messageId) {
        try {
            const messageDoc = await db.collection('messages').doc(messageId).get();
            if (messageDoc.exists) {
                const messageData = messageDoc.data();
                await db.collection('users').doc(currentUser.uid).collection('savedMessages').doc(messageId).set({
                    content: messageData.content,
                    originalTimestamp: messageData.timestamp,
                    savedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert('Message saved to your collection!');
                loadSavedMessages(currentUser.uid); // Refresh saved messages
            }
        } catch (error) {
            console.error("Error saving message:", error);
            alert("Failed to save message.");
        }
    } else if (event.target.classList.contains('reply-message-btn') && messageId) {
        alert(`Functionality for replying to message ${messageId} would be implemented here.`);
        // This would typically open a modal or navigate to a new page to compose a reply,
        // potentially linking it to the original message.
    }
});

/**
 * Attaches event listeners for dynamically added message buttons.
 * This function should be called after messages are loaded/reloaded.
 * (Alternative: use event delegation on parent container for better performance)
 */
function attachDynamicMessageEventListeners() {
    // Event delegation is already implemented above, so this function might not be strictly needed
    // if all dynamic elements are handled via delegation on their static parent.
    // However, if direct listeners were needed for some reason, this is where they'd be attached.
}


// --- Generate Gratitude Capsule ---
document.getElementById('generate-capsule-btn').addEventListener('click', async () => {
    if (!currentUser) {
        alert('Please wait, signing in...');
        return;
    }
    alert('Generating your Gratitude Capsule...');
    // This would involve:
    // 1. Fetching all saved messages from `users/${currentUser.uid}/savedMessages`.
    // 2. Fetching unlocked affirmations from `users/${currentUser.uid}/unlockedPacks`.
    // 3. Compiling them into a downloadable format (e.g., PDF, text file).
    // This might require a backend function for generating the file.
    try {
        const savedMessagesSnapshot = await db.collection('users').doc(currentUser.uid).collection('savedMessages').get();
        const savedMessages = savedMessagesSnapshot.docs.map(doc => doc.data().content);

        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const unlockedPacks = userDoc.data().unlockedPacks || {};
        let affirmations = [];

        for (const packId in unlockedPacks) {
            if (unlockedPacks[packId]) {
                const packContentSnapshot = await db.collection('affirmationPacks').doc(packId).collection('affirmations').get();
                packContentSnapshot.forEach(doc => {
                    affirmations.push(doc.data().text);
                });
            }
        }

        let capsuleContent = "--- Your Gratitude Capsule ---\n\n";
        if (savedMessages.length > 0) {
            capsuleContent += "Saved Messages:\n";
            savedMessages.forEach((msg, index) => {
                capsuleContent += `${index + 1}. "${msg}"\n`;
            });
            capsuleContent += "\n";
        }

        if (affirmations.length > 0) {
            capsuleContent += "Unlocked Affirmations:\n";
            affirmations.forEach((aff, index) => {
                capsuleContent += `${index + 1}. "${aff}"\n`;
            });
            capsuleContent += "\n";
        }

        if (savedMessages.length === 0 && affirmations.length === 0) {
            alert("Your capsule is empty! Save some messages or unlock affirmation packs first.");
            return;
        }

        // Create a downloadable blob
        const blob = new Blob([capsuleContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Gratitude_Capsule_${new Date().toLocaleDateString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Gratitude Capsule generated and downloaded!');

    } catch (error) {
        console.error("Error generating capsule:", error);
        alert("Failed to generate Gratitude Capsule.");
    }
});


// ==========================================================
// 5. UI Specific Interactions
// ==========================================================

// JavaScript to toggle card details form visibility based on radio button selection
document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
    radio.addEventListener('change', function() {
        const cardDetailsForm = document.getElementById('card-details-form');
        // Card details form is only for 'credit_debit'
        if (this.value === 'credit_debit') {
            cardDetailsForm.style.display = 'block';
        } else {
            cardDetailsForm.style.display = 'none';
        }
        // For Google Pay/Apple Pay, you might display specific buttons provided by their SDKs
        // E.g., if (this.value === 'google_pay') { /* Show Google Pay button */ }
        // For this example, we just hide the card form.
    });
});

// ==========================================================
// 6. Initial Loads (after user authentication)
//    These functions are called once the user is authenticated (onAuthStateChanged).
// ==========================================================
// Initial loading of data is handled within onAuthStateChanged to ensure `currentUser` is set.
// The functions themselves are defined above.

// Note: The PayPal, Google Pay, and Apple Pay webhook/payment verification logic is server-side (e.g., an Azure Function).
// This client-side code initiates the payment process, but the actual verification
// of payment completion and updating the database for sponsorships/tokens
// happens on your backend webhook handler for security.
// Ensure your server-side (e.g., Azure Function for PayPal webhook, or other backend for mobile wallets)
// is properly configured to verify payment signatures for security.


const API_GATEWAY = 'http://localhost:8080/api/v1';

async function fetchApi(url, options = {}) {
    try {
        const response = await fetch(`${API_GATEWAY}${url}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        const data = await response.text();
        let json;
        try { json = JSON.parse(data); } catch (e) { json = data; }

        if (!response.ok) {
            console.error(`Request Failed: ${options.method || 'GET'} ${url} -> ${response.status} ${response.statusText}`, json);
            return null; // Don't throw, let script continue
        }
        return json;
    } catch (err) {
        console.error(`Network Error: ${options.method || 'GET'} ${url} ->`, err.message);
        return null;
    }
}

// Data to seed
const MOCK_USERS = [
    { username: 'alice_eng', email: 'alice@test.com', password: 'Password123!', fullName: 'Alice Johnson', phoneNumber: '+10000000001' },
    { username: 'bob_product', email: 'bob@test.com', password: 'Password123!', fullName: 'Bob Smith', phoneNumber: '+10000000002' },
    { username: 'charlie_qa', email: 'charlie@test.com', password: 'Password123!', fullName: 'Charlie Davis', phoneNumber: '+10000000003' },
    { username: 'diana_design', email: 'diana@test.com', password: 'Password123!', fullName: 'Diana Prince', phoneNumber: '+10000000004' },
    { username: 'eve_marketing', email: 'eve@test.com', password: 'Password123!', fullName: 'Eve Adams', phoneNumber: '+10000000005' },
];

const MOCK_ROOMS = [
    { name: 'Engineering Sync', description: 'Daily standups and tech discussions', type: 'GROUP', members: ['bob_product', 'charlie_qa'] },
    { name: 'Product Launch Pod', description: 'Go-to-market strategy group', type: 'GROUP', members: ['diana_design', 'eve_marketing'] },
    { name: 'Random Breakroom', description: 'Watercooler discussions', type: 'GROUP', members: ['bob_product', 'charlie_qa', 'diana_design', 'eve_marketing'] }
];

async function seed() {
    console.log("🚀 Starting ConnectHub Dummy Data Seeder...");

    // 1. Give gateway 5-10s to be fully ready
    console.log("⏳ Waiting 10s for API Gateway & Services to be fully warm...");
    await new Promise(r => setTimeout(r, 10000));

    // 2. Register Mock Users
    let userTokens = {};
    for (let u of MOCK_USERS) {
        console.log(`\nRegistering user: ${u.username}...`);
        await fetchApi('/auth/register', { method: 'POST', body: JSON.stringify(u) });

        // E2E ByPass
        const verifyRes = await fetchApi('/auth/verify-registration-otp', {
            method: 'POST', body: JSON.stringify({ email: u.email, otp: '000000' })
        });

        if (verifyRes && verifyRes.accessToken) {
            userTokens[u.username] = verifyRes.accessToken;
            console.log(`✅ ${u.username} verified & logged in!`);
        } else {
            console.error(`❌ Failed to verify ${u.username}`);
        }
    }

    const parseJwt = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    let users = {};
    for (let un of Object.keys(userTokens)) {
        users[un] = parseJwt(userTokens[un]).sub;
    }

    const aliceToken = userTokens['alice_eng'];
    if (!aliceToken) return console.error("Critical failure: Could not orchestrate as Alice");

    // 3. Create Group Rooms as Alice
    let roomIds = [];
    for (let r of MOCK_ROOMS) {
        console.log(`\nCreating Room: ${r.name}...`);
        const payload = { ...r, memberIds: r.members.map(m => parseInt(users[m])) };
        delete payload.members;

        const roomRes = await fetchApi('/rooms', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${aliceToken}` },
            body: JSON.stringify(payload)
        });
        if (roomRes && roomRes.roomId) {
            roomIds.push(roomRes.roomId);
            console.log(`✅ Room '${r.name}' created! ID: ${roomRes.roomId}`);
        } else {
            console.warn(`⚠️ Warning: roomRes did not contain roomId:`, roomRes);
        }
    }

    const engRoom = roomIds[0];
    const launchRoom = roomIds[1];
    const breakRoom = roomIds[2];


    // 5. Send Realistic Chats via HTTP POST!
    const sendChat = async (room, username, content) => {
        console.log(`[${room}] ${username}: ${content}`);
        await fetchApi('/messages', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userTokens[username]}` },
            body: JSON.stringify({ roomId: room, senderId: users[username], content: content, type: 'TEXT' })
        });
        await new Promise(r => setTimeout(r, 600)); // Natural delay
    };

    console.log("\nPopulating realistic chat history...");
    // Eng Sync
    await sendChat(engRoom, 'alice_eng', "Hey team, morning! Are we good for the 10am sprint planning?");
    await sendChat(engRoom, 'bob_product', "Morning Alice. Yes, the backlog is fully groomed.");
    await sendChat(engRoom, 'charlie_qa', "I have a couple blockers on the new UI component to discuss.");
    await sendChat(engRoom, 'alice_eng', "Got it Charlie, let's put it first on the agenda in 15 mins.");

    // Launch Pod
    await sendChat(launchRoom, 'diana_design', "Just dropped the new marketing assets into the design folder!");
    await sendChat(launchRoom, 'alice_eng', "Awesome, they look great. Eve, can we get these on socials by Friday?");
    await sendChat(launchRoom, 'eve_marketing', "Absolutely! I've already queued up the Twitter threads.");

    // Some random DMs
    console.log("\nCreating a Direct Message...");
    const dmRes = await fetchApi('/rooms', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aliceToken}` },
        body: JSON.stringify({ name: 'Direct Message', type: 'DM', memberIds: [users['diana_design']] })
    });
    if (dmRes && dmRes.roomId) {
        await sendChat(dmRes.roomId, 'alice_eng', "Hey Diana, quick question about the logo padding.");
        await sendChat(dmRes.roomId, 'diana_design', "Sure thing, what's up? Needs to be tighter?");
        await sendChat(dmRes.roomId, 'alice_eng', "Exactly, it's colliding with the mobile navbar.");
    }

    console.log("\n✅ Seeding complete! Login with alice@test.com / Password123! to view the lived-in environment.");
}

seed();

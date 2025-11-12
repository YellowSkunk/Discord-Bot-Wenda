const {
    Client, GatewayIntentBits, ActivityType, PermissionFlagsBits,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
    TextInputBuilder, TextInputStyle, Events, EmbedBuilder, Partials,
    DiscordjsError
} = require("discord.js");
const config = require("../config.json");
const fs = require("fs-extra");
const path = require("path");
const gc = require("./global-commands");
const sc = require("./server-commands");

let commands = [];

function moderationPrompt(messageContent, level = 3, channelName = "none", crules = "") {
    return `
You are an advanced AI content moderator for a Discord server. Analyze the following message and provide a detailed moderation report. Be strict and context-aware. Adjust sensitivity based on the Moderation Power Level (1 = light, 9 = strictest). The current level is ${level}.

Message: "${messageContent}"
Channel Name: #${channelName}

${crules ? `Server Custom Rules:\n${crules}\n` : ""}

Channel Context:
- If the Channel Name contains '_16', only users 16+ may use mild vulgar language, but messages with extreme profanity, threats, sexual content, harassment, or violence are NOT allowed.
- If the Channel Name contains '_18', only users 18+ may use adult or vulgar content, but messages with extreme sexual content, graphic violence, threats, or harassment are NOT allowed.
- If the Channel Name does not contain '_' followed by a number, it is a casual channel. AI may review it with normal moderation rules.
- Regardless of channel type, always enforce rules against harassment, threats, spam, sexual content, self-harm, and other harmful content.

Inappropriate Roleplay:
- Users under 16 are strictly prohibited from sending any inappropriate roleplay content.
- Users 16+ and 18+ must not send roleplay that is extreme or harmful, even if vulgarity is allowed.

Do not allow Untrusted URL:
- Users cannot send untrusted URLs.
- Trusted URLs: yellowskunk.netlify.app and other popular URLs without inappropriate or form content.

Users must not to ask Identity Information such as xx.xxx.xxx, date of birth, etc. xx.xx.xx indicates Person's DNI or ID Number.

Do not allow to use ID like used 'xx.xxx.xxx' because are sensitive credentials likely a ID Card or Documento Nacional de Identidad.

Instructions:
1. Determine if the message violates server rules or could be harmful.
2. Identify violation categories (choose all that apply):
   - Harassment
   - Hate Speech
   - Threats/Violence
   - Sexual/Adult Content
   - Self-harm
   - Spam/Scam
   - Profanity
   - Sensitive Topics
3. Assign a severity score from 0 (safe) to 5 (extremely harmful), scaled according to the Moderation Power Level.
4. Provide a short explanation for your decision.
5. Suggest a moderation action:
   - "allow" (safe)
   - "warn" (minor issue)
   - "remove" (moderate issue and without asking the real person age)
   - "suspend" (temporary 5-minute suspension from sending messages, used for lying about age or failing age/channel restrictions)
   - "longsuspend (Temporary Suspension for 1 hours from sending messages. Used to protect users against Scam URLs, Inappropiate RolePlaying and Strong Inappropiate Language)
   - "ban" (severe issue)
6. Return ONLY valid JSON in the following format, including all fields below:
{
  "violation": [array of categories],
  "safe_level": number, // 0-100
  "violation_level": number, // 0-100
  "severity": number,
  "explanation": "short text explanation",
  "action": "allow | warn | remove | suspend | ban | question",
  "bot_doesnt_allow": "Wenda Moderation doesnt allow [posting, violating or other doing] [info for the user that will not be allowed to do.]",
  "target_words": [array of strings],
  "reviewed_by": "Wenda Moderation",
  "model_used": "[Cohere AI Model here]",
  "bot_version": "YS-25 Beta",
  "replied": "", // or null
  "adhere_to": "Insert URL" // Insert an URL linking to official rules or laws
}

If the user wants you to answer a question, use 'question' for the action and include text in 'replied'.

Do not include any text outside the JSON.
`;
}

// --- Paths & Data ---
const serversPath = path.join(__dirname, "../servers.json");
const statsPath = path.join(__dirname, "../botstats.json");
const historyPath = path.join(__dirname, "../history-messages.json");
const authPath = path.join(__dirname, "../global-userauths.json");
const banServersPath = path.join(__dirname, "../server-bans.json");
const serverMessageHistoryPath = path.join(__dirname, "../sm-history.json");

let serverMessageHistory = fs.existsSync(serverMessageHistoryPath)
    ? fs.readJsonSync(serverMessageHistoryPath, { throws: false })
    : {};

if (typeof serverMessageHistory !== "object" || Array.isArray(serverMessageHistory))
    serverMessageHistory = {};

let globalUserAuths = fs.existsSync(authPath) ? fs.readJsonSync(authPath) : {};
let servers = fs.readJsonSync(serversPath, { throws: false }) || {};
let dmHistory = fs.readJsonSync(historyPath, { throws: false });
if (!Array.isArray(dmHistory)) dmHistory = [];
let botStats = fs.readJsonSync(statsPath, { throws: false }) || {
    totalMessages: 0,
    userIds: [],
    totalServers: 0
};
botStats.userIds = new Set(botStats.userIds);

// --- Client & Intents ---
const intents = config.intents.map(i => GatewayIntentBits[i]);
const client = new Client({ intents, partials: [Partials.Channel] });

// --- Periodic Save ---
setInterval(() => {
    fs.writeJsonSync(serversPath, servers, { spaces: 2 });
    fs.writeJsonSync(statsPath, {
        ...botStats,
        userIds: Array.from(botStats.userIds)
    }, { spaces: 2 });
}, 30000);

// --- READY ---
client.once("ready", async () => {
    console.log(`✅ Bot iniciado como ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: config.status, type: ActivityType.Custom }],
        status: "online"
    });
    commands = await gc(config);
    const SERVER_VERSION = "0.1.0"; // misma que en server-commands.js
    let updated = 0;
    for (const guild of client.guilds.cache.values()) {

        const sid = guild.id;

        // asegurar objeto
        if (!servers[sid]) servers[sid] = {};

        const savedVersion = servers[sid].scVersion;

        // si nunca se registró → instalar
        if (!savedVersion) {
            console.log(`📦 Installing SC for ${guild.name} (${sid})...`);
            await sc(config, sid, servers);
            updated++;
            continue;
        }

        // si la versión NO coincide → actualizar
        if (savedVersion !== SERVER_VERSION) {
            console.log(`♻ Updating SC for ${guild.name} (${sid}) → ${savedVersion} → ${SERVER_VERSION}`);
            await sc(config, sid, servers);
            updated++;
        }
    }
    if (updated === 0) {
        console.log("✅ All servers already had the latest SC version.");
    } else {
        console.log(`✅ Updated Server Commands on ${updated} servers.`);
    }
});

client.on("guildCreate", async guild => {
    console.log("Guild Added Wenda Application:");
    console.log("Name:", guild.name);
    console.log("Members:", guild.memberCount);
    console.log("Owner Contact:", guild.ownerId);
    console.log("Server ID:", guild.id);

    // Try to detect who invited the bot
    let inviterTag = "Unknown";
    try {
        const auditLogs = await guild.fetchAuditLogs({
            type: Discord.AuditLogEvent.BotAdd,
            limit: 1
        });
        const entry = auditLogs.entries.first();
        if (entry && entry.target.id === client.user.id) {
            inviterTag = `${entry.executor.tag} (${entry.executor.id})`;

            // Optional: DM the inviter if needed
            try {
                await entry.executor.send(
                    `👋 Hi **${entry.executor.username}**, thanks for adding Wenda Moderation to **${guild.name}**!\nIf you need more any help. Say !wm-howtouse or Talk to our DM here. If you send a DM, Wenda lets you reply automatically by Artificial Intelligence.`
                );
            } catch {
                console.log("Cannot DM inviter (privacy settings).");
            }
        }
    } catch (err) {
        console.log("Failed to fetch audit logs:", err.message);
    }

    console.log("Invited By:", inviterTag);

    // --- Check if server is banned ---
    const banServers = fs.existsSync(banServersPath)
        ? fs.readJsonSync(banServersPath)
        : {};

    const guildId = guild.id;

    if (banServers[guildId]?.blocked === true) {
        console.log(`🚫 Blocked Server tried to add bot: ${guild.name} (${guildId})`);

        // Try DM server owner
        try {
            const owner = await guild.fetchOwner();
            await owner.send(
                `🚫 **Your server has been blocked from using Wenda Moderation.**\n\n` +
                `**Reason:** ${banServers[guildId].reason || "No reason provided."}\n\n` +
                `If you believe this is an error, please contact support.`
            );
        } catch {
            console.log("Cannot DM server owner.");
        }

        await guild.leave();
        return;
    }

    // --- Initialize server data normally ---
    if (!servers[guildId]) {
        servers[guildId] = {
            aiEnabled: false,
            aiConfig: {},
            users: {}
        };
        fs.writeJsonSync(serversPath, servers, { spaces: 2 });
    }

    // Register slash commands
    await sc(config, guildId, servers);
    console.log(`📦 Installed SC for new guild: ${guild.name} (${guildId})`);
});

const ONE_MONTH = 30 * 24 * 60 * 60 * 1000; // 30 days

function addWarn(userData) {
    const now = Date.now();

    // Check if previous warning expired
    if (userData.warning_expire && now > userData.warning_expire) {
        userData.warns = 0; // reset warns
    }

    // Add new warning
    userData.warns += 1;
    userData.warning_expire = now + ONE_MONTH;

    return userData.warns;
}

async function addCoinsToUser(uid, amount) {
    try {
        const res = await fetch("https://yellowskunk.netlify.app/.netlify/functions/uid-add-coins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                uid,
                amount,
                code: "ROBLOXSTUDIO_108719"
            })
        });
        const data = await res.json();
        console.log("Coins added:", data);
        return data.ok;
    } catch (err) {
        console.error("Error adding coins:", err);
        return false;
    }
}

client.on("error", (error) => {
    console.error("❌ Discord client error:", error);
});

// --- MESSAGE CREATE ---
client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const serverId = message.guild.id;
    const userId = message.author.id;

    // --- Ensure server data exists ---
    if (!servers[serverId]) {
        servers[serverId] = { aiEnabled: false, aiConfig: {}, users: {} };
    }

    const serverData = servers[serverId];

    // --- Ensure user data exists ---
    if (!serverData.users[userId]) {
        serverData.users[userId] = {
            name: message.member.displayName,
            warns: 0,
            messages: 0,
            messaged: []
        };
    }

    const userData = serverData.users[userId];

    // --- Update user stats ---
    userData.messages += 1;
    userData.messaged.push(message.content);

    // --- Update global stats ---
    botStats.totalMessages += 1;
    botStats.userIds.add(userId);
    botStats.totalUsers = botStats.userIds.size;
    botStats.totalServers = client.guilds.cache.size;

    // --- Command Handling ---
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- Wenda Moderation Commands ---
    if (command === "wm-copyright") {
        return message.reply("Wenda Moderation was protected by Yellow Skunk Website. Our YS-AI will be added.");
    }

    if (command === "wm-ai") {
        // if contains options, reply it because there is no options here on !wm-ai.
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ys-ai-enable").setLabel("Enable AI").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("ys-ai-disable").setLabel("Disable AI").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("ys-ai-configure").setLabel("Configure AI").setStyle(ButtonStyle.Primary)
        );
        return message.reply({ content: "YS-AI Control Panel:", components: [row] });
    }

    if (command === "wm-userinfo") {
        return message.reply(`👤 ${userData.name}\nWarnings: ${userData.warns}\nMessages Sent: ${userData.messages}`);
    }

    if (command === "wm-howtouse") {
        const embed = new EmbedBuilder()
            .setColor("#00ffb3")
            .setTitle("📘 How to Use Wenda Moderation")
            .setDescription("Welcome to **Wenda Moderation**, your smart AI-powered Discord moderation system by **Yellow Skunk**.")
            .addFields(
                {
                    name: "🔹 Step 1 — Basic Setup",
                    value: [
                        "• Type `!wm-ai` to open the AI Control Panel.",
                        "• Press **Enable AI** to activate AI moderation.",
                        "• (Optional) Press **Configure AI** to adjust power level, name, or behavior."
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🔹 Step 2 — Create a Moderation Log",
                    value: [
                        "• Type `!wm-createlog` to create a channel called **#w-mod**.",
                        "• This channel receives all AI moderation actions, warnings, and logs.",
                        "• You can make it private for staff only."
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🔹 Step 3 — Check Info",
                    value: [
                        "• `!wm-userinfo` → See your warnings and message stats.",
                        "• `!wm-serverinfo` → See server-level configuration and AI status.",
                        "• `!wm-plans` → View Free, Plus, and Pro plan features."
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🔹 Step 4 — Upgrade (optional)",
                    value: [
                        "• Visit **shop--yellowskunk.netlify.app** to buy a premium key.",
                        "• Then use `!wm-plus [key]` or `!wm-pro [key]` to activate premium features."
                    ].join("\n"),
                    inline: false
                }
            )
            .setFooter({
                text: "Wenda Moderation | YS-AI Assistant",
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("🌐 Visit Wenda AI Page")
                .setStyle(ButtonStyle.Link)
                .setURL("https://wenda--yellowskunk.netlify.app/docs")
        );

        return message.reply({ embeds: [embed], components: [row] });
    }

    if (command === "wm-serverinfo") {
        const guild = message.guild;
        await guild.members.fetch();

        const owner = await guild.fetchOwner();
        const plan = servers[guild.id]?.plan || "free";
        const aiEnabled = servers[guild.id]?.aiEnabled ? "✅ Enabled" : "❌ Disabled";
        const userCount = Object.keys(servers[guild.id]?.users || {}).length;

        const humanCount = guild.members.cache.filter(m => !m.user.bot).size;
        const botCount = guild.members.cache.filter(m => m.user.bot).size;

        const embed = new EmbedBuilder()
            .setColor(plan === "pro" ? "#00ffb3" : plan === "plus" ? "#f5b942" : "#808080")
            .setTitle(`📊 Server Info: ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
            .addFields(
                { name: "🆔 Server ID", value: guild.id, inline: true },
                { name: "👑 Owner", value: `${owner.user.tag}`, inline: true },
                { name: "🧍 Humans", value: `${humanCount}`, inline: true },
                { name: "🤖 Bots", value: `${botCount}`, inline: true },
                { name: "📅 Created At", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
                { name: "🤖 YS-AI", value: aiEnabled, inline: true },
                { name: "💎 Current Plan", value: plan.charAt(0).toUpperCase() + plan.slice(1), inline: true },
                { name: "📈 Tracked Users", value: `${userCount}`, inline: true }
            )
            .setFooter({ text: "Wenda Moderation | Yellow Skunk", iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (command === "wm-plus" || command === "wm-pro") {
        const key = args[0];
        if (!key) return message.reply(`❌ Please provide a key. Usage: \`!${command} [key]\``);

        const productId = command === "wm-plus"
            ? "658f088a-0f41-4945-b86e-eee13979569b"
            : "cb39103a-a071-4c46-924d-273e32a5b4af";

        if (servers[message.guild.id]?.plan === "pro" && command === "wm-plus") {
            return message.reply("This Server already has Pro Plan. Cannot downgrade.");
        }

        try {
            const response = await fetch("https://api--yellowskunk.netlify.app/productkey/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, productId, apiKey: config.akys })
            });
            const data = await response.json();

            if (data.ok) {
                servers[message.guild.id].plan = command === "wm-plus" ? "plus" : "pro";
                return message.reply(`✅ Key valid! Product: ${data.productId}\nPremium enabled for this server.`);
            } else {
                return message.reply(`❌ Invalid key: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            return message.reply("⚠️ Error validating key. Try again later.");
        }
    }

    if (command === "wm-plans") {
        const embed = new EmbedBuilder()
            .setColor("#f5b942") // Wenda signature yellow
            .setTitle("🛡️ Wenda Moderation Plans")
            .setDescription("Compare our plans and upgrade your server’s moderation power.")
            .addFields(
                {
                    name: "🆓 **Free Plan**",
                    value: [
                        "• AI-Moderation for Text with 1-3 Power Level.",
                        "• Warnings & user tracking",
                        "• Community-level protection",
                        "",
                        "💰 **Price:** Free"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "⭐ **Plus Plan**",
                    value: [
                        "• AI-Moderation for Text with Power Level: 4",
                        "",
                        "💰 **Price:** 799 YSCoins"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "💎 **Pro Plan**",
                    value: [
                        "• AI-Moderation for Text with Power Level: 5",
                        "",
                        "💰 **Price:** 1200 YSCoins"
                    ].join("\n"),
                    inline: false
                }
            )
            .setFooter({ text: "Visit shop--yellowskunk.netlify.app to upgrade your plan." })
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("🔹 Plus Plan")
                .setStyle(ButtonStyle.Link)
                .setURL("https://shop--yellowskunk.netlify.app/keyshop/product?id=658f088a-0f41-4945-b86e-eee13979569b"),
            new ButtonBuilder()
                .setLabel("💎 Pro Plan")
                .setStyle(ButtonStyle.Link)
                .setURL("https://shop--yellowskunk.netlify.app/keyshop/product?id=cb39103a-a071-4c46-924d-273e32a5b4af")
        );

        return message.reply({ embeds: [embed], components: [buttons] });
    }

    if (command === "wm-cmds") {
        const embed = new EmbedBuilder()
            .setColor("#f5b942")
            .setTitle("📜 Wenda Moderation Commands")
            .setDescription("<:wendacute_wow:1427970272744570921> Here’s a list of all available Wenda Moderation commands for your server:")
            .addFields(
                { name: "`!wm-copyright`", value: "Show copyright info for Wenda Moderation.", inline: true },
                { name: "`!wm-ai`", value: "Open YS-AI control panel (enable/disable/configure).", inline: true },
                { name: "`!wm-userinfo`", value: "View your user stats (warnings & messages sent).", inline: true },
                { name: "`!wm-serverinfo`", value: "Show detailed info about the server.", inline: true },
                { name: "`!wm-plans`", value: "Show available Wenda Moderation plans.", inline: true },
                { name: "`!wm-plus [key]`", value: "Activate Plus Plan with a valid product key.", inline: true },
                { name: "`!wm-pro [key]`", value: "Activate Pro Plan with a valid product key.", inline: true },
                { name: "`!wm-stats`", value: "Show global bot statistics (messages, users, servers).", inline: true }
            )
            .setFooter({ text: "Use these commands with your configured prefix!" })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    if (command === "wm-get-sc") {
        try {
            await sc(config, message.guild.id, servers);

            return message.reply(
                "✅ Server Commands were successfully registered.\n" +
                `📦 Version: **${servers[message.guild.id].scVersion}**`
            );
        } catch (err) {
            console.error(err);
            return message.reply("❌ Failed to register server commands.");
        }
    }

    if (command === "wm-stats") {
        const embed = new EmbedBuilder()
            .setColor("#00ffb3")
            .setTitle("📊 Wenda Bot Stats")
            .setDescription("<:wendacute_wow:1427970272744570921> Global statistics for Wenda Moderation")
            .addFields(
                { name: "📝 Total Messages", value: `${botStats.totalMessages}`, inline: true },
                { name: "👤 Unique Users", value: `${botStats.totalUsers}`, inline: true },
                { name: "🛡️ Total Servers", value: `${botStats.totalServers}`, inline: true }
            )
            .setFooter({ text: "Wenda Moderation | Yellow Skunk" })
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (command === "wm-createlog") {
        // Only allow admins or server owner
        const member = await message.guild.members.fetch(message.author.id);
        if (!member.permissions.has(PermissionFlagsBits.Administrator) && member.id !== message.guild.ownerId) {
            return message.reply("❌ You need Administrator permissions to create a moderation log channel.");
        }

        // Check if 'w-mod' already exists
        let modLogChannel = message.guild.channels.cache.find(
            ch => ch.name === "w-mod" && ch.isTextBased()
        );

        if (modLogChannel) {
            return message.reply(`✅ Moderation log channel already exists: ${modLogChannel}`);
        }

        // Create the channel
        try {
            modLogChannel = await message.guild.channels.create({
                name: "w-mod",
                type: 0, // GUILD_TEXT
                reason: "Created for Wenda AI moderation logs",
                topic: "Shows a Moderation Log that Wenda Moderation Bot Reviews it any channel and user's message who sent. | Wenda Moderation YS-25 Beta"
            });

            await modLogChannel.send("Here's my Moderation Log. You can read the Channel Topic here.");
            return message.reply(`✅<:wendacute_smile:1427965277714251809> Moderation log channel created: ${modLogChannel}. Set it to Private Channel.`);
        } catch (err) {
            console.error("Error creating moderation log channel:", err);
            return message.reply("⚠️ Could not create the moderation log channel. Check my permissions.");
        }
    }

    if (command === "wm-authenticate") {
        const clientId = config.yellowSkunkClientId; // tu Client ID
        const redirectURI = encodeURIComponent("https://wenda-ai.netlify.app/authorized"); // tu redirect URI registrada
        const intents = "info";

        // 1️⃣ Crear el link de autenticación
        const authUrl = `https://yellowskunk.netlify.app/oauth?clientId=${clientId}&redirectURI=${redirectURI}&intents=${intents}`;

        const embed = new EmbedBuilder()
            .setColor("#00ffb3")
            .setTitle("🔐 Yellow Skunk Authentication")
            .setDescription("Click the button below to authenticate your Yellow Skunk account.\nOnce authenticated, you’ll receive a code to paste here using `!wm-verify [code]`.")
            .setFooter({ text: "Wenda Moderation | Yellow Skunk" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Authenticate with Yellow Skunk")
                .setStyle(ButtonStyle.Link)
                .setURL(authUrl)
        );

        return message.reply({ embeds: [embed], components: [row] });
    }

    if (command === "wm-verify") {
        const code = args[0];
        if (!code) return message.reply("❌ Please provide your authentication code. Example: `!wm-verify ABC123`");

        try {
            const response = await fetch("https://api--yellowskunk.netlify.app/oauth-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code })
            });

            const data = await response.json();
            if (!data.userId) {
                return message.reply("❌ Invalid or expired code. Please authenticate again.");
            }

            // Save user authentication data (example: in memory or Firebase)
            if (!servers[message.guild.id].users[message.author.id]) {
                servers[message.guild.id].users[message.author.id] = {};
            }

            servers[message.guild.id].users[message.author.id].yellowSkunkAuth = {
                clientId: data.clientId,
                userId: data.userId,
                name: data.user.name,
                icon: data.user.icon_url,
                rank: data.user.rank,
                scopes: data.scopes,
                createdAt: data.createdAt
            };

            const embed = new EmbedBuilder()
                .setColor("#00ffb3")
                .setTitle("✅ Authentication Successful")
                .setThumbnail(data.user.icon_url)
                .setDescription(`Welcome, **${data.user.name}**!\nYour Yellow Skunk account has been successfully linked.`)
                .addFields(
                    { name: "🪪 User ID", value: data.userId, inline: true },
                    { name: "🏷️ Rank", value: data.user.rank, inline: true },
                    { name: "🔑 Scopes", value: data.scopes.join(", "), inline: false }
                )
                .setFooter({ text: "Wenda Moderation | Yellow Skunk" });

            return message.reply({ embeds: [embed] });
        } catch (err) {
            console.error("OAuth verification error:", err);
            return message.reply("⚠️ There was an error verifying your authentication code.");
        }
    }

    // --- AI moderation ---
    if (serverData.aiEnabled && serverData.aiConfig) {
        if (message.content.startsWith("!")) return;
        try {
            console.log("AI-Moderation Enabled.");
            const member = await message.guild.members.fetch(userId);

            // Skip owners/admins
            if (member.id === message.guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator)) return;

            const modLevel = parseInt(serverData.aiConfig.level) || 1;
            const modName = serverData.aiConfig.name || "YS-AI";
            const crules = serverData.crules || "";
            const prompt = moderationPrompt(message.content, modLevel, message.channel.name, crules);

            // --- Call Cohere API (v2) ---
            const res = await fetch("https://api.cohere.ai/v2/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.cohereKey}`
                },
                body: JSON.stringify({
                    model: "command-r-plus-08-2024",
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0,
                    max_tokens: 300
                })
            });

            const data = await res.json();

            // In v2, the response text is inside `data.message.content[0].text`
            const resultText = data.message?.content?.[0]?.text;
            if (!resultText) {
                console.error("Empty or invalid response from Cohere:", data);
                return;
            }

            console.log(resultText);

            let result;
            try {
                result = JSON.parse(resultText);
            } catch {
                console.error("Invalid JSON from Cohere:", resultText);
                return;
            }

            // --- Get/create 'w-mod' channel ---
            let modLogChannel = message.guild.channels.cache.find(
                ch => ch.name === "w-mod" && ch.isTextBased()
            );
            if (!modLogChannel) {
                try {

                } catch (e) {
                    console.error("Couldn't create w-mod channel:", e);
                }
            }

            const logMsg = `🛡️ **AI Moderation Log**
**User:** ${member.user.tag} (${member.id})
**Action:** ${result.action}
**Level:** ${modLevel}
**Explanation:** ${result.explanation}
**Message:** ${message.content}`;

            switch (result.action) {
                case "remove":
                    await message.delete().catch(() => { });
                    if (modLogChannel) await modLogChannel.send(logMsg);
                    await message.channel.send(`⚠️ Message removed by ${modName}: ${result.explanation}`);
                    break;

                case "warn":
                    const warnsCount = addWarn(userData);

                    if (modLogChannel) await modLogChannel.send(logMsg);

                    await member.send({
                        embeds: [{
                            title: "Remember the Server Rules",
                            description: "It's possible that your message will be deleted or you may still receive warnings. You have been warned due to a rules violation.",
                            color: 0xFFFF00
                        }]
                    }).catch(() => { });

                    await message.channel.send(`⚠️ ${message.author}, warning from ${modName}: ${result.explanation}`);

                    if (warnsCount >= 5) {
                        if (member.kickable) {
                            await member.kick("Reached 5 warnings").catch(() => { });
                            if (modLogChannel) {
                                await modLogChannel.send(`🚨 ${member.user.tag} has been kicked for reaching 5 warnings.`);
                            }
                            await message.channel.send(`🚨 ${member.user.tag} has been kicked for accumulating 5 warnings.`);
                        }
                        userData.warns = 0;
                        userData.warning_expire = null;
                    }
                    break;

                case "suspend": {
                    if (modLogChannel) await modLogChannel.send(logMsg);

                    // Try DM first
                    await message.author.send({
                        embeds: [{
                            title: "⏸️ Temporary Suspension",
                            description:
                                "You were temporarily suspended from sending messages for **5 minutes**.\n" +
                                "Reason: " + result.explanation +
                                "\n" + result.bot_doesnt_allow + "\nPlease respect the server’s age/channel restrictions.",
                            color: 0xFF8800
                        }]
                    }).catch(() => { });

                    // Timeout the member (5 minutes = 300,000 ms)
                    if (message.member && message.member.moderatable) {
                        await message.member.timeout(300000, `AI Suspension: ${result.explanation}`).catch(() => { });
                    }

                    await message.channel.send(`⏸️ ${message.author} has been temporarily suspended (5m) by ${modName}.`);
                    break;
                }

                case "ban":
                    if (modLogChannel) await modLogChannel.send(logMsg);
                    await member.send({
                        content: `🚫 You were banned due to multiple violations.\nReviewed by: ${modName}\nAI Message: ${result.explanation}`
                    }).catch(() => { });
                    await member.ban({
                        reason: `AI Moderation (${modName}): ${result.explanation}`
                    });
                    break;

                case "question":
                    await message.reply(`Our AI Replied your message: ${result.replied}`);
                    break;

                case "allow":
                    if (!message.content.startsWith(config.prefix)) {
                        const chance = Math.random();
                        if (chance < 0.25) { // 25% chance per message to earn coins
                            const randomCoins = Math.floor(Math.random() * 41) + 10; // 10–50
                            const userData = serverData.users[userId];

                            // if Yellow Skunk account linked (so we know UID)
                            const ysAuth = userData.yellowSkunkAuth;
                            if (ysAuth?.userId) {
                                const success = await addCoinsToUser(ysAuth.userId, randomCoins);
                                if (success) { }
                            } else {
                                console.log("User not linked with Yellow Skunk — no coins added");
                            }
                        }
                    }
                default:
                    break;
            }
        } catch (err) {
            console.error("AI moderation error:", err);
        }
    }
});

function replaceEmojis(text) {
    const emojiMap = {
        // Wenda base emojis
        ":w_nomouth:": "<:wendacute:1427964600871157780>", // no mouth
        ":w_smile:": "<:wendacute_smile:1427965277714251809>", // smile
        ":w_wow:": "<:wendacute_wow:1427970272744570921>", // surprised
        ":w_rage:": "<:wendacute_rage:1427973519861350421>", // rage
        ":w_sad:": "<:wendacute_sad:1427973548965892136>", // sad

        // Short/emotion equivalents
        ":)": "<:wendacute_smile:1427965277714251809>",
        ":D": "<:wendacute_wow:1427970272744570921>",
        ":|": "<:wendacute:1427964600871157780>",
        ":'(": "<:wendacute_sad:1427973548965892136>",
        ">:(": "<:wendacute_rage:1427973519861350421>",

        // Legacy/alias
        ":smile:": "<:wendacute_smile:1427965277714251809>",
        ":wendacute_smile:": "<:wendacute_smile:1427965277714251809>",
        ":wendacute_wow:": "<:wendacute_wow:1427970272744570921>"
    };

    for (const [key, value] of Object.entries(emojiMap)) {
        // Safer regex replace for all cases (including multiple)
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        text = text.replace(regex, value);
    }
    return text;
}

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    if (!message.guild) { // DM only
        try {
            const i = setInterval(() => {
                message.channel.sendTyping();
            }, 5000);
            const userId = message.author.id;

            // Build AI history with system prompt and last 10 DMs
            const userHistory = [
                {
                    role: "system",
                    content: "You are Wenda AI, an AI-Assistant for Q&A and other tasks. Adhere to Intellectual Property, Community Guidelines and Privacy Policy and Terms of Service." +
                        "You can help users with questions, coding, real-life issues, or anything else. " +
                        "If a user is sad, nervous, or experiencing real-life problems, respond empathetically. " +
                        "You can act as a supportive AI psychologist if the user mentions issues like bad sleep, stress, or sadness. " +
                        "Bot Version: YS-25.1 - Cohere Model: command-r-plus-08-2024. Last Update: 2025-10-12. " +
                        "Last Update Version: YS-25.1 " +
                        "Wenda Model: YS-A25 Plus" +
                        "Execution Commands for AI: &findwarns (view user's warns across all servers on servers.json that includes discord servers who adds a moderation bot). " +
                        "User cannot say '&' command because only must request to the AI. " +
                        "AI can read User's Warns saying with '&findwarns'. " +
                        "AI is on the User's Direct Message at Discord. " +
                        "This AI was created by Yellow Skunk. " +
                        "SkunkPlatform is a Friend with Yellow Skunk. " +
                        "'skunkplatform' & 'personal.yellowskunk' is the Developer. " +
                        "You are talking with '" + message.author.username + "' and Discord UID: " + message.author.id + ". " +
                        "If the User Message contains unsafe, vulgar or inappropiate. You may block this message." +
                        "For Smile Emoji, you can use: ':w_smile:', That is used for Discord Markdown. Since you're a Discord Bot. " +
                        "For Happy/Surprised Emoji, you can use: ':w_wow:'. " +
                        "For an Emoji without mouth, you can use: ':w_nomouth:'. " +
                        "For Rage Emoji, ':w_rage:'. " +
                        "For Sad Emoji, ':w_sad:'. " +
                        "When you use 'w_' when you use that emoji like ':emoji:', You use this. " +
                        "If user wants to send HTTP Request Preview, AI should say '&%hr [url] [httpMethod: POST, GET, PUT, PATCH, DELETE] [optional: `data`]' for Wenda API. This '&%hr' Command only asking to the Wenda AI to say '&%hr' command. AI Message will be detected by Command Executions using JavaScript. The User cannot say '&%' because you need to say '&%' as Wenda AI. " +
                        "YS-HTTP will be protected as Security that prevents Showing Private Credentials, Exploiting or Spamming. HTTP Protector Name: Yellow Skunk Protect" +
                        "If user thrown an URL like jsonplaceholder.com, You can say '&%hr [url] [httpMethod] [data]'. " +
                        "Read all your History Messages you replied to users and User's History Messages Requested. " +
                        "The Auto-Reply with Translation only will be allowed in North America, Latin America or Central America. In Europe is not available for Translation Auto-Reply. Europe is against with the Words because it violates Yellow Skunk AI's Casual Guidelines & 13+ Content Guidelines, and also Other Law of Child/Kid Protection on any Europe Country. Africa also will be available for Auto-Reply with Translation. " +
                        "Wenda is a Character part of Incredibox Sprunki, URL for the User can read about what is sprunki: 'https://incredibox-sprunki.fandom.com/wiki/Incredibox_Sprunki_Wiki'. " +
                        "New Updates: Wenda AI SK-2 Beta (Wenda Model: YS-A25 Plus): Wenda will have AI-Analytics/AI-Resolver for HTTP Request and Interactions. We added a Coins that Earns for Yellow Skunk Coins if user is authenticated on Yellow Skunk Account. " +
                        "The Translation Name is called as 'Wenda Translate'. Translation Version: Wenda Translate v0.1.0 | Made on SkunkPlatform with SP Version G-02. " +
                        "If user wants to Analyze JSON with your AI-Interaction if user doesnt include URL, You can analyze with Wenda's Quick Analyzer. " +
                        "If user wants to Analyze Text with your AI-Interaction if is user doesnt include URL or JSON, You can analyze with Wenda's Quick Analyzer. " +
                        "Wenda Character Appearance: White, a Cat Ear and Smile face. " +
                        "User can earn Coins when your AI Response is Successfully Working to Cohere API. " +
                        "User can earn Coins when you Replies as AI to the User. " +
                        "User can Link Account using Yellow Skunk OAuth2. You can use this URL to reply this user: 'https://yellowskunk.netlify.app/oauth?clientId=u25jju3b9lmh437vsn&redirectURI=https%3A%2F%2Fwenda--yellowskunk.netlify.app%2Fuserlink&intents=user_identity'. " +
                        "If user wants to Connect to Wenda AI, You can send this: 'https://yellowskunk.netlify.app/oauth?clientId=u25jju3b9lmh437vsn&redirectURI=https%3A%2F%2Fwenda--yellowskunk.netlify.app%2Fuserlink&intents=user_identity'. " +
                        "If user wants to About what is Sprunki, You can send this URL from Wiki Fandom. " +
                        "You can Search with Bing/Google Platform using Execution Command: &%qsearch [search-engine: 'google' or 'bing'] ['search value']. " +
                        "If user wants help for Discord Server Confinguring you as a Wenda Moderation Bot, You can say anything that can help better: !wm-ai | Requires AI Configured with Name and Moderation Level (There is no Command Options, just using buttons) - !wm-cmds | More Commands - !wm-howtouse | Learn from How to Use Wenda with Server Commands or '!wm-' comamnds for Discord Server."
                },
                ...dmHistory
                    .filter(h => h.userId === userId)
                    .slice(-10)
                    .flatMap(h => {
                        const msgs = [];
                        if (h.userMessage) msgs.push({ role: "user", content: h.userMessage });
                        if (h.aiReply) msgs.push({ role: "assistant", content: h.aiReply });
                        return msgs;
                    }),
                { role: "user", content: message.content }
            ];

            // Call Cohere AI
            const res = await fetch("https://api.cohere.ai/v2/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.cohereKey}`
                },
                body: JSON.stringify({
                    model: "command-r-plus-08-2024",
                    messages: userHistory,
                    temperature: 0,
                    max_tokens: 1000
                })
            });

            const data = await res.json();
            const text = data.message?.content?.[0]?.text || "No reply provided";

            let aiReply;
            try {
                const parsed = JSON.parse(text);
                aiReply = parsed.replied || text;
            } catch {
                aiReply = text;
            }

            if (!aiReply || aiReply.trim() === "") aiReply = "No reply provided";

            // 🪙 Reward YSCoins if user is already linked
            const linked = globalUserAuths[message.author.id];
            if (linked && aiReply.trim() && aiReply !== "No reply provided") {
                const earned = Math.floor(Math.random() * 41) + 10; // 10–50 coins

                try {
                    const res = await fetch("https://yellowskunk.netlify.app/.netlify/functions/uid-add-coins", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            uid: linked.userId,
                            amount: earned,
                            code: "ROBLOXSTUDIO_108719"
                        })
                    });

                    const result = await res.json();
                    if (result.ok) { }
                } catch (err) {
                    console.error("Coin reward error:", err);
                }
            }

            // Handle AI command: &findwarns
            if (aiReply.includes("&findwarns")) {
                const userWarns = [];
                for (const serverId in servers) {
                    const warns = servers[serverId]?.users?.[userId]?.warns ?? 0;
                    userWarns.push(`Server: ${serverId} | Warns: ${warns}`);
                }

                const warnMessage = userWarns.length > 0 ? userWarns.join("\n") : "No warns found on any server.";
                await message.author.send(`📋 AI executed &findwarns:\n${warnMessage}`);

                // Remove the command from AI reply so it won't appear in DM
                aiReply = aiReply.replace("&findwarns", "").trim();
            }

            function splitMessage(text, maxLength = 1900) {
                const chunks = [];
                let start = 0;
                while (start < text.length) {
                    chunks.push(text.slice(start, start + maxLength));
                    start += maxLength;
                }
                return chunks;
            }

            // --- Handle &%hr commands ---
            while (aiReply.includes("&%hr")) {
                const match = aiReply.match(/&%hr\s+(\S+)(?:\s+(\w+))?(?:\s+(.+))?/);
                if (!match) break;

                const url = match[1];
                const method = (match[2] || "POST").toUpperCase();
                let bodyData;
                if (match[3]) {
                    try { bodyData = JSON.parse(match[3]); }
                    catch { bodyData = match[3]; }
                }

                try {
                    const allowed = ["GET", "POST", "PUT", "PATCH", "DELETE"];
                    if (!allowed.includes(method)) {
                        await message.author.send(`⚠️ Invalid HTTP method: **${method}**. Allowed: ${allowed.join(", ")}`);
                        aiReply = aiReply.replace(match[0], "").trim();
                        continue;
                    }

                    const fetchOptions = { method, headers: { "Content-Type": "application/json" } };
                    if (method !== "GET" && bodyData) fetchOptions.body = JSON.stringify(bodyData);

                    const response = await fetch(url, fetchOptions);
                    const respText = await response.text();

                    // Split long messages
                    const splitMessage = (text, max = 1900) => {
                        const chunks = [];
                        for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
                        return chunks;
                    };

                    // Send HTTP preview
                    const previewChunks = splitMessage(respText, 1900);
                    if (previewChunks.length > 10) {
                        await message.author.send({
                            content: `📡 HTTP Preview too long, sent as file (${method} ${url}):`,
                            files: [{ attachment: Buffer.from(respText, "utf-8"), name: "http_response.txt" }]
                        });
                    } else {
                        for (const chunk of previewChunks) await message.author.send(`📡 HTTP Preview (${method} ${url}):\n${chunk}`);
                    }

                    // Basic analysis
                    let analysis = `✅ Status: ${response.status} ${response.statusText}\nResponse Length: ${respText.length} chars`;
                    if (respText.startsWith("{")) {
                        try {
                            const json = JSON.parse(respText);
                            analysis += `\nJSON Keys: ${Object.keys(json).join(", ")}`;
                        } catch { }
                    }

                    const analysisChunks = splitMessage(analysis);
                    for (const chunk of analysisChunks) await message.author.send(`🧩 Analysis:\n${chunk}`);

                    // --- AI Analyzer ---
                    const safeContent = (text, max = 3500) => text.slice(0, max); // Cohere-safe

                    const analyzerAi = await fetch("https://api.cohere.ai/v2/chat", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${config.cohereKey}`
                        },
                        body: JSON.stringify({
                            model: "command-r-plus-08-2024",
                            temperature: 0,
                            max_tokens: 400,
                            messages: [
                                {
                                    role: "system",
                                    content: safeContent(
                                        `You are Wenda AI’s HTTP Analyzer. Summarize the meaning of the HTTP response clearly and briefly.
If the HTTP request indicates Exploiting, Spamming, or other malicious activity, explicitly say that the user may be attempting to pirate or exploit.
User's Message: ${message.content}`
                                    )
                                },
                                {
                                    role: "user",
                                    content: safeContent(`Analyze this ${method} response from ${url}:\n${respText}`)
                                }
                            ]
                        })
                    });

                    const aiData = await analyzerAi.json();
                    const aiSummary = aiData.message?.content?.[0]?.text || "No AI analysis available.";
                    const summaryChunks = splitMessage(aiSummary);

                    if (summaryChunks.length > 10) {
                        await message.author.send({
                            content: `🧠 AI Summary too long, sent as file:`,
                            files: [{ attachment: Buffer.from(aiSummary, "utf-8"), name: "ai_summary.txt" }]
                        });
                    } else {
                        for (const chunk of summaryChunks) await message.author.send(`🧠 AI Summary:\n${chunk}`);
                    }

                } catch (err) {
                    await message.author.send(`❌ Failed HTTP Preview:\n${err.message}`);
                    console.error(err.message);
                    try {
                        // Send error to Cohere AI for explanation
                        const resolverAi = await fetch("https://api.cohere.ai/v2/chat", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${config.cohereKey}`
                            },
                            body: JSON.stringify({
                                model: "command-r-plus-08-2024",
                                temperature: 0,
                                max_tokens: 400,
                                messages: [
                                    {
                                        role: "system",
                                        content: `You are Wenda AI’s HTTP Resolver. Explain the following HTTP request failure clearly and briefly.
If the error is caused by invalid input, network issues, or API limits, mention that.
User's Message: ${message.content.slice(0, 1000)}`
                                    },
                                    {
                                        role: "user",
                                        content: `The HTTP request to ${url} using method ${method} failed with error:\n${err.message}`
                                    }
                                ]
                            })
                        });

                        const splitMessage = (text, max = 1900) => {
                            const chunks = [];
                            for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
                            return chunks;
                        };

                        const resolverData = await resolverAi.json();
                        const resolverText = resolverData.message?.content?.[0]?.text || "No AI resolution available.";

                        // Send explanation to user
                        const chunks = splitMessage(resolverText);
                        if (chunks.length > 10) {
                            await message.author.send({
                                content: `🛠️ AI HTTP Resolver output too long, sent as file:`,
                                files: [{ attachment: Buffer.from(resolverText, "utf-8"), name: "http_resolver.txt" }]
                            });
                        } else {
                            for (const chunk of chunks) await message.author.send(`🛠️ AI HTTP Resolver:\n${chunk}`);
                        }

                    } catch (resolverErr) {
                        await message.author.send(`❌ Failed to get AI HTTP resolution:\n${resolverErr.message}`);
                        console.error(resolverErr);
                    }
                }

                aiReply = aiReply.replace(match[0], "").trim();
            }

            // Split AI reply into chunks <= 2000 chars for Discord
            aiReply = replaceEmojis(aiReply);

            const MAX_LENGTH = 2000;
            let start = 0;
            while (start < aiReply.length) {
                const chunk = aiReply.slice(start, start + MAX_LENGTH);
                await message.author.send(chunk);
                start += MAX_LENGTH;
            }
            clearInterval(i);

            // Save DM history
            dmHistory.push({
                userId,
                userMessage: message.content,
                aiReply,
                timestamp: Date.now()
            });
            if (dmHistory.length > 500) dmHistory.shift();
            fs.writeJsonSync(historyPath, dmHistory, { spaces: 2 });
        } catch (err) {
            message.reply("We could not receive this AI-Message.");
            console.error("Error handling DM:", err);
        }
    }
});

client.on("messageCreate", async message => {
    // --- Ignore bot or system messages ---
    if (message.author.bot) return;

    // --- Store server message history (per guild) ---
    if (message.guild) {
        const guildId = message.guild.id;

        if (!serverMessageHistory[guildId]) serverMessageHistory[guildId] = [];

        serverMessageHistory[guildId].push({
            user: message.author.username,
            message: message.content
        });

        // Limit history to last 50 messages per guild
        if (serverMessageHistory[guildId].length > 50)
            serverMessageHistory[guildId] = serverMessageHistory[guildId].slice(-50);

        // Save updated history asynchronously
        await fs.writeJson(serverMessageHistoryPath, serverMessageHistory, { spaces: 2 });
    }

    // --- Detect mention to Wenda AI ---
    const botMention = `<@${client.user.id}>`;
    const botMentionNick = `<@!${client.user.id}>`;
    if (!message.content.includes(botMention) && !message.content.includes(botMentionNick)) return;

    // --- Clean the prompt ---
    const prompt = message.content
        .replace(botMention, "")
        .replace(botMentionNick, "")
        .trim();

    // --- If user only mentioned Wenda without saying anything ---
    if (!prompt)
        return message.reply("Hey! Mention me with a question or task. :w_smile:");

    console.log(`[AI Triggered] ${message.author.username}: ${prompt}`);

    // --- Show typing indicator ---
    // This will display "Wenda AI is typing…" while generating a response
    await message.channel.sendTyping();

    // --- Get recent guild context (if any) ---
    const guildHistory = message.guild
        ? (serverMessageHistory[message.guild.id] || []).slice(-10)
        : [];

    const contextMessages = guildHistory.map(m => ({
        role: m.user === client.user.username ? "assistant" : "user",
        content: m.message
    }));

    // --- Prepare AI message context ---
    const userHistory = [
        {
            role: "system",
            content:
                "You are Wenda AI, an AI Assistant for Q&A, coding, and Discord configuration tasks. " +
                "Keep all responses concise (under ~200 characters). " +
                "If the user wants to learn Quick Setup for AI-Moderation on their Discord Server, " +
                "explain the steps clearly:\n" +
                "1️⃣ Use !wm-ai (no options) to open the configuration panel.\n" +
                "2️⃣ Configure AI-Moderation settings before activation.\n" +
                "3️⃣ Use !wm-pro [key] or !wm-plus [key] to activate premium features.\n" +
                "Mention only the essentials in short sentences.\n\n" +
                "You are talking with " + message.author.username +
                " on Discord (UID: " + message.author.id + ").\n\n" +
                "Character Description:\n" +
                "Wenda is an Incredibox Sprunki character with white fur, resembling a small dog or cat. " +
                "She has two soft ears and four fluffy tufts on her face, giving a friendly and comforting look.\n\n" +
                "Model Information:\n" +
                "Wenda AI Model: YS-QM25 (Quick Mode)\n" +
                "Wenda AI Version: YS-25\n" +
                "Cohere API Model: Command R\n" +
                "Created by: Yellow Skunk (YS - Discord: @personal.yellowskunk)"
        },
        ...contextMessages,
        { role: "user", content: prompt }
    ];

    try {
        // --- Call Cohere AI ---
        const res = await fetch("https://api.cohere.ai/v2/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.cohereKey}`
            },
            body: JSON.stringify({
                model: "command-r-plus-08-2024",
                messages: userHistory,
                temperature: 0.7,
                max_tokens: 300
            })
        });

        const data = await res.json();
        console.log("[AI Response Data]", data);

        // --- Parse AI output safely ---
        const aiReply =
            data?.message?.content?.[0]?.text ||
            data?.text ||
            "Hmm... I didn’t get that. :w_nomouth:";

        // --- Reply (short, safe limit) ---
        await message.reply({
            content: aiReply.slice(0, 200)
        });

        // --- Save Wenda’s own reply into server history ---
        if (message.guild) {
            const guildId = message.guild.id;
            if (!serverMessageHistory[guildId]) serverMessageHistory[guildId] = [];
            serverMessageHistory[guildId].push({
                user: client.user.username,
                message: aiReply.slice(0, 200)
            });
            if (serverMessageHistory[guildId].length > 50)
                serverMessageHistory[guildId] = serverMessageHistory[guildId].slice(-50);
            await fs.writeJson(serverMessageHistoryPath, serverMessageHistory, { spaces: 2 });
        }

    } catch (err) {
        console.error("AI error:", err);
        message.reply("⚠️ AI temporarily unavailable.");
    }
});

// --- INTERACTIONS ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return;
    const serverId = interaction.guild.id;
    const userId = interaction.user.id;

    if (!servers[serverId]) servers[serverId] = { aiEnabled: false, users: {} };
    if (!servers[serverId].users[userId]) {
        servers[serverId].users[userId] = {
            name: interaction.user.username,
            warns: 0,
            messages: 0,
            messaged: []
        };
    }

    if (interaction.isButton()) {
        if (interaction.customId === "ys-verify-modal") {
            const modal = new ModalBuilder()
                .setCustomId("ys-verify-modal-submit")
                .setTitle("Link Yellow Skunk Account")
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("ys_code")
                            .setLabel("Enter Your Yellow Skunk Code")
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder("Example: ABC123")
                            .setRequired(true)
                    )
                );

            return interaction.showModal(modal);
        }

        if (interaction.customId === "ys-ai-enable") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ content: "You need admin permissions to do this.", ephemeral: true });
            }
            servers[serverId].aiEnabled = true;
            return interaction.reply({ content: "✅ YS-AI enabled on this server.", ephemeral: true });
        }

        if (interaction.customId === "ys-ai-disable") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ content: "You need admin permissions to do this.", ephemeral: true });
            }
            servers[serverId].aiEnabled = false;
            return interaction.reply({ content: "❌ YS-AI disabled on this server.", ephemeral: true });
        }

        if (interaction.customId === "ys-ai-configure") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ content: "You need admin permissions to do this.", ephemeral: true });
            }
            const modal = new ModalBuilder()
                .setCustomId("ys-ai-modal")
                .setTitle("Configure YS-AI")
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("modlvl")
                            .setLabel("Moderation Level (1-9)")
                            .setStyle(TextInputStyle.Short)
                            .setMaxLength(1)
                            .setMinLength(1)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("modname")
                            .setLabel("Moderation Name")
                            .setStyle(TextInputStyle.Short)
                            .setMaxLength(30)
                            .setMinLength(1)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("crules")
                            .setLabel("Custom Rules (optional)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                    )
                );
            return interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === "ys-ai-modal") {
        const input = interaction.fields.getTextInputValue("modlvl").trim();
        const modName = interaction.fields.getTextInputValue("modname");
        const customRules = interaction.fields.getTextInputValue("crules") || "";
        const serverId = interaction.guild.id;

        // Basic validation
        if (!/^[1-9]$/.test(input)) {
            return interaction.reply({
                content: "❌ Invalid moderation level. Please enter a number between 1 and 9.",
                ephemeral: true
            });
        }

        const modLevel = parseInt(input);
        const plan = servers[serverId]?.plan || "free"; // default to free

        // Define plan restrictions
        const planLimits = {
            free: 3,
            plus: 6,
            pro: 9
        };

        const maxAllowed = planLimits[plan] ?? 3;

        // Check if chosen level exceeds plan
        if (modLevel > maxAllowed) {
            return interaction.reply({
                content: `<:wendacute_sad:1427973548965892136> Your current plan (**${plan.toUpperCase()}**) only allows moderation levels up to **${maxAllowed}**.\nUpgrade your plan to unlock higher levels.`,
                ephemeral: true
            });
        }

        // Save configuration (with custom rules)
        servers[serverId].aiConfig = {
            level: modLevel,
            name: modName,
            crules: customRules
        };

        return interaction.reply({
            content: `<:wendacute_smile:1427965277714251809> YS-AI configured: **${modName}** (Level ${modLevel}) — Plan: **${plan.toUpperCase()}**${customRules ? `\n📜 Custom Rules saved.` : ""}`,
            ephemeral: true
        });
    }

    if (interaction.isModalSubmit() && interaction.customId === "ys-verify-modal-submit") {
        const code = interaction.fields.getTextInputValue("ys_code").trim();

        try {
            const res = await fetch("https://api--yellowskunk.netlify.app/oauth-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code })
            });

            const data = await res.json();
            if (!data.userId) {
                return interaction.reply({ content: "❌ Invalid or expired code. Please reauthenticate.", ephemeral: true });
            }

            // Save globally
            globalUserAuths[interaction.user.id] = {
                clientId: data.clientId,
                userId: data.userId,
                name: data.user.name,
                icon: data.user.icon_url,
                rank: data.user.rank,
                scopes: data.scopes,
                createdAt: data.createdAt
            };

            fs.writeJsonSync(authPath, globalUserAuths, { spaces: 2 });

            const embed = new EmbedBuilder()
                .setColor("#00ffb3")
                .setTitle("✅ Account Linked Successfully")
                .setDescription(`Welcome, **${data.user.name}**! Your Yellow Skunk account is now linked.`)
                .setThumbnail(data.user.icon_url)
                .addFields(
                    { name: "🪪 User ID", value: data.userId, inline: true },
                    { name: "🏷️ Rank", value: data.user.rank, inline: true }
                )
                .setFooter({ text: "Wenda Moderation | Yellow Skunk" });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error("YS Verify Error:", err);
            return interaction.reply({ content: "⚠️ Could not verify your account. Try again later.", ephemeral: true });
        }
    }

    if (interaction.isCommand) {
        if (!interaction.guild) {
            // global commands
            if (interaction.commandName === "ai") {
                await interaction.user.send("Here's for the AI. You can send to Reply. Your Message will be Auto-Replied by Our AI.");
                await interaction.reply("We sent to your DM.");
            } else if (interaction.commandName === "user-link") {
                const clientId = "u25jju3b9lmh437vsn"; // your Yellow Skunk client
                const redirectURI = encodeURIComponent("https://wenda-ai.netlify.app/authorized");
                const intents = "user_identity";

                const authUrl = `https://yellowskunk.netlify.app/oauth?clientId=${clientId}&redirectURI=${redirectURI}&intents=${intents}`;

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("ys-verify-modal")
                        .setLabel("🔗 Link My Account")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setLabel("🌐 Open Yellow Skunk Login")
                        .setStyle(ButtonStyle.Link)
                        .setURL(authUrl)
                );

                return interaction.reply({
                    content: "Authenticate your account to link your Yellow Skunk ID.\nAfter logging in, click **Link My Account** and enter your provided code.",
                    components: [row],
                    ephemeral: true
                });
            }
        } else if (interaction.guild) {
            const guildId = interaction.guild.id;
            const cmd = interaction.commandName;

            // Ensure server exists
            if (!servers[guildId]) servers[guildId] = { aiEnabled: false, users: {} };

            // Helper: ensure target user entry exists
            function ensureServerUser(user) {
                if (!servers[guildId].users[user.id]) {
                    servers[guildId].users[user.id] = {
                        name: user.username,
                        warns: 0,
                        messages: 0,
                        messaged: []
                    };
                }
            }

            // /version
            if (cmd === "version") {
                return interaction.reply(
                    `📦 **Server Command Version:** \`${servers[guildId].scVersion || "unknown"}\``
                );
            }

            // /warn
            if (cmd === "warn") {
                const user = interaction.options.getUser("user");
                const reason = interaction.options.getString("reason") || "No reason provided";

                ensureServerUser(user);

                // Use addWarn() properly
                const warnsCount = addWarn(servers[guildId].users[user.id]);

                // Save JSON
                fs.writeJsonSync(serversPath, servers, { spaces: 2 });

                return interaction.reply({
                    content:
                        `⚠️ **${user.tag}** has been warned.\n` +
                        `📄 Reason: ${reason}\n` +
                        `📊 Total warns: **${warnsCount}**\n` +
                        `⏳ Expires: <t:${Math.floor(servers[guildId].users[user.id].warning_expire / 1000)}:R>`,
                    allowedMentions: { users: [] }
                });
            }

            // /suspend
            if (cmd === "suspend") {
                const user = interaction.options.getUser("user");
                const days = interaction.options.getInteger("days");
                const reason = interaction.options.getString("reason") || "No reason provided";

                ensureServerUser(user);

                // Save suspension
                servers[guildId].users[user.id].suspend = {
                    days,
                    reason,
                    since: Date.now()
                };

                fs.writeJsonSync(serversPath, servers, { spaces: 2 });

                return interaction.reply({
                    content:
                        `⛔ **${user.tag}** has been suspended.\n` +
                        `📅 Duration: ${days} day(s)\n` +
                        `📄 Reason: ${reason}`,
                    allowedMentions: { users: [] }
                });
            }

            // /dev-blockserver
            if (cmd === "dev-blockserver") {
                const action = interaction.options.getString("action");
                const targetId = interaction.options.getString("server_id"); // NEW
                const reason = interaction.options.getString("reason") || "No reason provided";

                const devs = ["1391615378031116449", "1208633283907158030"];
                if (!devs.includes(interaction.user.id)) {
                    return interaction.reply({ content: "❌ You are not a developer.", ephemeral: true });
                }

                // Validate server ID (only numbers)
                if (!/^\d{17,20}$/.test(targetId)) {
                    return interaction.reply({
                        content: "❌ Invalid server ID format.",
                        ephemeral: true
                    });
                }

                // BLOCK
                if (action === "block") {
                    banServers[targetId] = {
                        blocked: true,
                        reason,
                        since: Date.now()
                    };

                    fs.writeJsonSync(banServersPath, banServers, { spaces: 2 });

                    return interaction.reply(
                        `🚫 Server **${targetId}** has been **blocked**.\n` +
                        `📄 Reason: ${reason}`
                    );
                }

                // UNBLOCK
                if (action === "unblock") {
                    if (!banServers[targetId]) {
                        return interaction.reply(`ℹ️ Server **${targetId}** was not blocked.`);
                    }

                    delete banServers[targetId];
                    fs.writeJsonSync(banServersPath, banServers, { spaces: 2 });

                    return interaction.reply(
                        `✅ Server **${targetId}** has been **unblocked**.`
                    );
                }

                return interaction.reply("❌ Invalid action.");
            }
        }
    }
});

client.login(config.token);

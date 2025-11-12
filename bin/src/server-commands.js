const { REST, Routes } = require("discord.js");

const SERVER_VERSION = "0.1.0";
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

module.exports = async (config, serverId, servers) => {

    if (!VERSION_REGEX.test(SERVER_VERSION)) {
        throw new Error(`❌ Invalid server command version '${SERVER_VERSION}'. Must be x.x.x`);
    }

    if (!servers[serverId]) servers[serverId] = {};
    servers[serverId].scVersion = SERVER_VERSION;

    const commands = [
        {
            name: "version",
            description: "Show server command version."
        },
        {
            name: "warn",
            description: "Warn a user for 1 month.",
            options: [
                {
                    type: 6, // USER
                    name: "user",
                    description: "User to warn",
                    required: true
                },
                {
                    type: 3, // STRING
                    name: "reason",
                    description: "Reason for the warning",
                    required: false
                }
            ]
        },
        {
            name: "dev-blockserver",
            description: "Developer server blocker.",
            options: [
                {
                    type: 3,
                    name: "action",
                    description: "block / unblock a server",
                    required: true,
                    choices: [
                        { name: "block", value: "block" },
                        { name: "unblock", value: "unblock" }
                    ]
                },
                {
                    type: 3,
                    name: "server_id",
                    description: "The target server ID",
                    required: true
                },
                {
                    type: 3,
                    name: "reason",
                    description: "Reason for action",
                    required: false
                }
            ]
        }
    ];

    const rest = new REST({ version: "10" }).setToken(config.token);

    try {
        console.log(`⏳ Registering SERVER slash commands for ${serverId}…`);

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, serverId),
            { body: commands }
        );

        console.log(`✅ SERVER commands registered! Version: ${SERVER_VERSION}`);

    } catch (err) {
        console.error("❌ Error registering server commands:", err);
    }

    return commands;
};

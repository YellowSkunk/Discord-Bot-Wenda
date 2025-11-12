const { REST, Routes } = require("discord.js");

module.exports = async (config) => {
    // Define slash commands directly here
    const commands = [
        {
            name: "ai",
            description: "Sends to your DM."
        },
        {
            name: "user-link",
            description: "Link your Yellow Skunk account to earn YSCoins."
        }
    ];

    // Register commands with Discord
    const rest = new REST({ version: "10" }).setToken(config.token);

    try {
        console.log("⏳ Registering slash commands...");
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands }
        );
        console.log("✅ Slash commands registered!");
    } catch (error) {
        console.error("❌ Error registering commands:", error);
    }

    // Return the plain commands array for use in index.js
    return commands;
};

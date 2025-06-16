import { Client, GatewayIntentBits, Partials, REST, Routes, InteractionType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';

import 'dotenv/config';
const MASTER_TOKEN = process.env.MASTER_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DATA_PATH = path.resolve('./active_bots.json');
const LOG_PATH = path.resolve('./logs.txt');

function logAction(action) {
    const log = `[${new Date().toISOString()}] ${action}\n`;
    fs.appendFileSync(LOG_PATH, log);
}

function loadBots() {
    if (!fs.existsSync(DATA_PATH)) return [];
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch {
        return [];
    }
}

function saveBots(bots) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(bots, null, 2));
}

function msToTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
}

function getEndTime(startedAt, time) {
    return new Date(new Date(startedAt).getTime() + time * 60 * 1000);
}

 
const master = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel]
});

const activeClients = new Map();  

 
const commands = [
    {
        name: 'addbot',
        description: 'Lance un bot Discord secondaire',
        options: [
            { name: 'botmodel', type: 3, description: 'Nom du modèle de bot', required: true },
            { name: 'token', type: 3, description: 'Token du bot à lancer', required: true },
            { name: 'appid', type: 3, description: 'App ID du bot', required: true },
            { name: 'time', type: 4, description: 'Durée en minutes', required: true }
        ]
    },
    {
        name: 'mybots',
        description: 'Affiche tous tes bots actifs'
    },
    {
        name: 'addtime',
        description: 'Ajoute du temps à un bot actif',
        options: [
            { name: 'appid', type: 3, description: 'App ID du bot', required: true },
            { name: 'minutes', type: 4, description: 'Minutes à ajouter', required: true }
        ]
    },
    {
        name: 'removebot',
        description: 'Supprime un bot actif',
        options: [
            { name: 'appid', type: 3, description: 'App ID du bot à supprimer', required: true }
        ]
    },
    {
        name: 'changetoken',
        description: 'Change le token d\'un bot actif',
        options: [
            { name: 'appid', type: 3, description: 'App ID du bot', required: true },
            { name: 'token', type: 3, description: 'Nouveau token du bot', required: true }
        ]
    }
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(MASTER_TOKEN);
    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
    );
}

 
async function launchBot({ userId, botmodel, token, appid, time }) {
    if (activeClients.has(appid)) return false;
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    try {
        await client.login(token);
        activeClients.set(appid, client);
        logAction(`Ajout du bot ${botmodel} (appid: ${appid}) par user ${userId}`);
        client.once('ready', () => {
            client.user.setActivity(`Masteré par ${userId}`);
        });
        return true;
    } catch (e) {
        return false;
    }
}

async function stopBot(appid, botmodel, userId) {
    const client = activeClients.get(appid);
    if (client) {
        await client.destroy();
        activeClients.delete(appid);
        logAction(`Suppression du bot ${botmodel} (appid: ${appid}) de user ${userId}`);
    }
}

 
cron.schedule('* * * * *', async () => {
    const bots = loadBots();
    const now = new Date();
    let changed = false;
    for (const bot of [...bots]) {
        const end = getEndTime(bot.startedAt, bot.time);
        if (now > end) {
            await stopBot(bot.appid, bot.botmodel, bot.userId);
            const idx = bots.findIndex(b => b.appid === bot.appid);
            if (idx !== -1) bots.splice(idx, 1);
            changed = true;
        }
    }
    if (changed) saveBots(bots);
});

 
master.once('ready', () => {
    console.log(`Master bot prêt: ${master.user.tag}`);
     
    const bots = loadBots();
    for (const bot of bots) {
        launchBot(bot);
    }
});

master.on('interactionCreate', async interaction => {
    if (interaction.type !== InteractionType.ApplicationCommand) return;
    if (interaction.commandName === 'addbot') {
        const botmodel = interaction.options.getString('botmodel');
        const token = interaction.options.getString('token');
        const appid = interaction.options.getString('appid');
        const time = interaction.options.getInteger('time');
        const userId = interaction.user.id;
        const bots = loadBots();
        if (bots.find(b => b.appid === appid)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Bot déjà actif')
                .setDescription(`Un bot avec cet App ID est déjà lancé sur le serveur !`)
                .setColor(0xED4245)
                .setFooter({ text: '✨ Nice Bots - Gestion V1 | by kdrsigma', iconURL: master.user.displayAvatarURL() })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: 64 });
        }
        const startedAt = new Date().toISOString();
        const botData = { userId, botmodel, token, appid, time, startedAt };
        const ok = await launchBot(botData);
        if (!ok) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Token invalide')
                .setDescription(`Impossible de lancer le bot. Vérifie le token Discord fourni.`)
                .setColor(0xED4245)
                .setFooter({ text: '✨ Nice Bots - Gestion V1 | by kdrsigma', iconURL: master.user.displayAvatarURL() })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: 64 });
        }
        bots.push(botData);
        saveBots(bots);
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot activé !')
            .setDescription(`Le bot **${botmodel}** est lancé avec succès !`)
            .addFields(
                { name: '⏱️ Durée', value: `${time} minutes`, inline: true },
                { name: '🆔 App ID', value: appid, inline: true },
                { name: '🔑 Token', value: `||${token}||`, inline: false }
            )
            .setColor(0x57F287)
            .setFooter({ text: '✨ Nice Bots - Gestion V1 | by kdrsigma', iconURL: master.user.displayAvatarURL() })
            .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: 64 });
    } else if (interaction.commandName === 'mybots') {
        const userId = interaction.user.id;
        const bots = loadBots().filter(b => b.userId === userId);
        if (!bots.length) {
            const embed = new EmbedBuilder()
                .setTitle('📭 Aucun bot actif')
                .setDescription('Tu n’as actuellement aucun bot actif sur ce serveur.')
                .setColor(0x5865F2)
                .setFooter({ text: '✨ Nice Bots - Gestion V1 | by kdrsigma', iconURL: master.user.displayAvatarURL() })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: 64 });
        }
        const embed = new EmbedBuilder()
            .setTitle('🤖 Tes bots actifs')
            .setColor(0x5865F2)
            .setFooter({ text: '✨ Nice Bots - Gestion V1 | by kdrsigma', iconURL: master.user.displayAvatarURL() })
            .setTimestamp();
        for (const bot of bots) {
            const end = getEndTime(bot.startedAt, bot.time);
            const remaining = end - new Date();
            embed.addFields({
                name: `• ${bot.botmodel}`,
                value: `AppID: 	${bot.appid}\nTemps restant: 	${msToTime(remaining)}\nFin: 	${end.toLocaleString()}`,
                inline: false
            });
        }
        await interaction.reply({ embeds: [embed], flags: 64 });
    } else if (interaction.commandName === 'addtime') {
        const userId = interaction.user.id;
        const appid = interaction.options.getString('appid');
        const minutes = interaction.options.getInteger('minutes');
        let bots = loadBots();
        const idx = bots.findIndex(b => b.appid === appid && b.userId === userId);
        if (idx === -1) {
            return interaction.reply({ content: `❌ Aucun bot trouvé avec cet App ID.`, flags: 64 });
        }
        bots[idx].time += minutes;
        saveBots(bots);
        logAction(`Ajout de ${minutes} min au bot ${bots[idx].botmodel} (appid: ${appid}) par user ${userId}`);
        const embed = new EmbedBuilder()
            .setTitle('⏱️ Temps ajouté !')
            .setDescription(`**${minutes} minutes** ajoutées au bot **${bots[idx].botmodel}**`)
            .addFields(
                { name: 'App ID', value: appid, inline: true },
                { name: 'Nouvelle durée', value: `${bots[idx].time} min`, inline: true }
            )
            .setColor(0x00BFFF)
            .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: 64 });
    } else if (interaction.commandName === 'removebot') {
        const userId = interaction.user.id;
        const appid = interaction.options.getString('appid');
        let bots = loadBots();
        const idx = bots.findIndex(b => b.appid === appid && b.userId === userId);
        if (idx === -1) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Bot introuvable')
                .setDescription(`Aucun bot avec cet App ID n’a été trouvé pour votre compte.`)
                .setColor(0xED4245)
                .setFooter({ text: '✨ Nice Bots - Gestion V1 | by kdrsigma', iconURL: master.user.displayAvatarURL() })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: 64 });
        }
        const bot = bots[idx];
        await stopBot(bot.appid, bot.botmodel, bot.userId);
        bots.splice(idx, 1);
        saveBots(bots);
        logAction(`Suppression du bot ${bot.botmodel} (appid: ${appid}) de user ${userId}`);
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Bot supprimé !')
            .setDescription(`Le bot **${bot.botmodel}** (App ID: ${appid}) a été supprimé et arrêté avec succès.`)
            .setColor(0xED4245)
            .setFooter({ text: '✨ Nice Bots - Gestion V1 | by kdrsigma', iconURL: master.user.displayAvatarURL() })
            .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: 64 });
    } else if (interaction.commandName === 'changetoken') {
        const userId = interaction.user.id;
        const appid = interaction.options.getString('appid');
        const newToken = interaction.options.getString('token');
        let bots = loadBots();
        const idx = bots.findIndex(b => b.appid === appid && b.userId === userId);
        if (idx === -1) {
            return interaction.reply({ content: `❌ Aucun bot trouvé avec cet App ID.`, flags: 64 });
        }
        const bot = bots[idx];
        await stopBot(bot.appid, bot.botmodel, bot.userId);
        bots[idx].token = newToken;
        saveBots(bots);
        const ok = await launchBot(bots[idx]);
        if (!ok) {
            return interaction.reply({ content: `❌ Token invalide ou erreur lors du redémarrage du bot.`, flags: 64 });
        }
        logAction(`Changement de token pour le bot ${bot.botmodel} (appid: ${appid}) par user ${userId}`);
        const embed = new EmbedBuilder()
            .setTitle('🔑 Token mis à jour !')
            .setDescription(`Le bot **${bot.botmodel}** a été relancé avec succès.`)
            .addFields(
                { name: 'App ID', value: appid, inline: true }
            )
            .setColor(0x43B581)
            .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
    
});

 
(async () => {
    await registerCommands();
    master.login(MASTER_TOKEN);
})();

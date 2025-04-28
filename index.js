const { Client, GatewayIntentBits, ChannelType, SlashCommandBuilder, Routes, REST } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const TOKEN = 'ton discord bot token';
const CLIENT_ID = 'X';
const GUILD_ID = 'X';
const WEBHOOK_URL = 'ton url webhook n8n';
const triggeredChannels = new Set();

const commandesFile = './commandes.json';
if (!fs.existsSync(commandesFile)) fs.writeFileSync(commandesFile, JSON.stringify({ commandes: [] }, null, 2));

function loadCommandes() {
  return JSON.parse(fs.readFileSync(commandesFile));
}
function saveCommandes(data) {
  fs.writeFileSync(commandesFile, JSON.stringify(data, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
});

client.on('channelCreate', async (channel) => {
  if (channel.type === ChannelType.GuildText) {
    setTimeout(async () => {
      try {
        await channel.send(
          "🎫 Merci d’avoir ouvert un ticket !\n\n" +
          "📦 Si tu veux passer commande, merci d’écrire **exactement et uniquement** le nom du produit indiqué sur le site + la quantité.\n" +
          "_Exemple :_ `2 Nitro Boost 1 mois`\n\n" +
          "⚠️ Pour l’instant, notre bot (v0.0.3) ne gère **qu’une seule commande par ticket**.\n" +
          "👉 Si tu veux commander plusieurs produits différents, merci d’**ouvrir un nouveau ticket pour chaque produit**.\n\n" +
          "🧾 Une **facture sera générée automatiquement** en quelques minutes.\n\n" +
          "❓ Si tu veux un renseignement ou autre chose, tu peux ignorer la réponse du bot et écrire normalement.\n" +
          "Un membre de l’équipe te répondra rapidement !\n\n" +
          "🕐 **Horaires de fonctionnement (bêta)** :\n" +
          "📅 Lundi & Vendredi : 18h - 21h30\n" +
          "📅 Mercredi : 11h - 21h30\n" +
          "📅 Week-end : 11h - 22h\n" +
          "⚠️ *Service indisponible certains jours exceptionnellement.*"
        );
        triggeredChannels.add(channel.id);
      } catch (error) {
        console.error(`❌ Erreur message : ${error.message}`);
      }
    }, 3500);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!triggeredChannels.has(message.channel.id)) return;

  const payload = {
    channelId: message.channel.id,
    channelName: message.channel.name,
    guildId: message.guild.id,
    userId: message.author.id,
    username: message.author.username,
    messageContent: message.content,
    messageId: message.id
  };

  try {
    const response = await axios.post(WEBHOOK_URL, payload);

    if (response.data && response.data.isCommand) {
      const commandes = loadCommandes();
      const newId = commandes.commandes.length > 0 ? Math.max(...commandes.commandes.map(c => c.id)) + 1 : 1;

      commandes.commandes.push({
        id: newId,
        userId: message.author.id,
        pseudo: message.author.username,
        produit: response.data.produits[0].nom,
        quantité: response.data.produits[0].quantité,
        prixTotal: response.data.prixTotal,
        status: 'en cours',
        note: ''
      });

      saveCommandes(commandes);
      console.log(`✅ Commande #${newId} ajoutée.`);
    }
  } catch (error) {
    console.error(`❌ Erreur Webhook : ${error.message}`);
  }

  triggeredChannels.delete(message.channel.id);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandes = loadCommandes();

  if (interaction.commandName === 'client') {
    const targetId = interaction.options.getUser('utilisateur')?.id || interaction.user.id;
    const commandesUser = commandes.commandes.filter(c => c.userId === targetId);

    if (commandesUser.length === 0) {
      await interaction.reply("❌ Aucune commande trouvée.");
      return;
    }

    const message = commandesUser.map(c => `🔹 #${c.id} - ${c.produit} x${c.quantité} - ${c.prixTotal}€ (${c.status})${c.note ? `\n📝 ${c.note}` : ''}`).join("\n\n");
    await interaction.reply({ content: `📦 Commandes de <@${targetId}>:\n\n${message}`, ephemeral: true });

  } else if (interaction.commandName === 'finish') {
    const id = interaction.options.getInteger('id');
    const commande = commandes.commandes.find(c => c.id === id);
    if (!commande) return interaction.reply("❌ Commande introuvable.");

    commande.status = 'terminée';
    saveCommandes(commandes);
    await interaction.reply(`✅ Commande #${id} marquée comme terminée.`);

  } else if (interaction.commandName === 'note') {
    const id = interaction.options.getInteger('id');
    const texte = interaction.options.getString('texte');
    const commande = commandes.commandes.find(c => c.id === id);
    if (!commande) return interaction.reply("❌ Commande introuvable.");

    commande.note = texte;
    saveCommandes(commandes);
    await interaction.reply(`📝 Note ajoutée à la commande #${id}.`);
  }
});

// Enregistrement des slash commands
const commands = [
  new SlashCommandBuilder().setName('client').setDescription("Voir tes commandes").addUserOption(opt => opt.setName("utilisateur").setDescription("Utilisateur")),
  new SlashCommandBuilder().setName('finish').setDescription("Terminer une commande").addIntegerOption(opt => opt.setName("id").setDescription("ID de la commande").setRequired(true)),
  new SlashCommandBuilder().setName('note').setDescription("Ajouter une note à une commande").addIntegerOption(opt => opt.setName("id").setDescription("ID de la commande").setRequired(true)).addStringOption(opt => opt.setName("texte").setDescription("Texte de la note").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log("🔁 Enregistrement des commandes slash...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Commandes slash enregistrées.");
  } catch (error) {
    console.error("❌ Erreur enregistrement : ", error);
  }
})();

client.login(TOKEN);

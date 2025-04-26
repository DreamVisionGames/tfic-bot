require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
axios.defaults.baseURL = 'https://tfic-org-website-production.up.railway.app';
// At the top of your bot file
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

function toUtcIso(inputString) {
  const d = new Date(inputString);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function getNextAvailableRole(session) {
  let idx = session.currentRoleIndex;
  while (
    idx < session.availableRoles.length &&
    session.roles.some(r => r.name === session.availableRoles[idx].name)
  ) {
    idx++;
  }

  return session.availableRoles[idx] || null;
}

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

function buildEventEmbed(event) {
  const embed = new EmbedBuilder()
    .setTitle(`📅 ${event.title}`)
    .setDescription(event.description || 'No description provided.')
    .setColor(0x5865f2)
    .addFields(
      {
        name: '🕒 Starts',
        value: `<t:${Math.floor(new Date(event.start).getTime() / 1000)}:F>`,
        inline: true
      },
      {
        name: '⏳ Ends',
        value: `<t:${Math.floor(new Date(event.end).getTime() / 1000)}:F>`,
        inline: true
      },
      {
        name: '🔗 View Event',
        value: `[Click to view](https://tfic-org-website-production.up.railway.app/events/${event.id})`
      },
      {
        name: '🎯 RSVP Roles',
        value: event.roles?.length
          ? event.roles.map(role => {
              const attendees = event.rsvps
                ?.filter(r => r.role === role.name && r.attending)
                .map(r => {
                  const sourceEmoji = r.source === 'discord' ? '🟦' : '🌐';
                  return `  ${sourceEmoji} ${r.username}`; // Unicode spaces for indent
                }) || [];
      
              const count = attendees.length;
              const roleLine = `**${role.icon} ${role.name}** — ${count}/${role.capacity}`;
              const attendeeList = attendees.length ? `\n${attendees.join('\n')}` : '';
      
              return `${roleLine}${attendeeList}`;
            }).join('\n\n') // double newline between roles
          : 'No roles configured.'
      }  
    );

  if (event.eventImageUrl) embed.setImage(event.eventImageUrl);

  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (const role of event.roles || []) {
    const current = event.rsvps?.filter(r => r.role === role.name && r.attending).length || 0;
    const isFull = current >= role.capacity;

    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`rsvp-${event.id}-${role.name}`)
        .setLabel(`${role.icon || ''} ${role.name || ''}`.trim())
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFull)
    );
  }

  // Add Cancel RSVP button if needed
  if ((event.rsvps?.filter(r => r.attending)?.length || 0) > 0) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`cancel-${event.id}`)
        .setLabel('Cancel RSVP')
        .setStyle(ButtonStyle.Danger)
    );
  }

  // Push the last row if it has buttons
  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return { embeds: [embed], components: rows };

}



const fs = require('fs');
const path = require('path');
const axiosLib = require('axios'); // renamed to avoid conflict

async function sendCustomEventEmbed(channel, event) {
  const embed = new EmbedBuilder()
    .setTitle(`📅 ${event.title}`)
    .setDescription(event.description || 'No description provided.')
    .setColor(0x5865f2)
    .addFields(
      {
        name: '🕒 Starts',
        value: `<t:${Math.floor(new Date(event.start).getTime() / 1000)}:F>`,
        inline: true
      },
      {
        name: '⏳ Ends',
        value: `<t:${Math.floor(new Date(event.end).getTime() / 1000)}:F>`,
        inline: true
      },
      {
        name: '🔗 View Event',
        value: `[Click to view](https://tfic-org-website-production.up.railway.app/events/${event.id})`
      },
      {
        name: '🎯 RSVP Roles',
        value: event.roles?.length
          ? event.roles.map(role => {
              const attendees = event.rsvps
                ?.filter(r => r.role === role.name && r.attending)
                .map(r => {
                  const sourceEmoji = r.source === 'discord' ? '🟦' : '🌐';
                  return `  ${sourceEmoji} ${r.username}`;
                }) || [];

              const count = attendees.length;
              const roleLine = `**${role.icon} ${role.name}** — ${count}/${role.capacity}`;
              const attendeeList = attendees.length ? `\n${attendees.join('\n')}` : '';

              return `${roleLine}${attendeeList}`;
            }).join('\n\n')
          : 'No roles configured.'
      }
    );

  const row = new ActionRowBuilder();
  for (const role of event.roles || []) {
    const current = event.rsvps?.filter(r => r.role === role.name && r.attending).length || 0;
    const isFull = current >= role.capacity;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rsvp-${event.id}-${role.name}`)
        .setLabel(`${role.icon} ${role.name}`.slice(0, 80))  // Truncate the label to 80 characters
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFull)
    );    
  }

  const totalAttending = event.rsvps?.filter(r => r.attending)?.length || 0;
  if (totalAttending > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cancel-${event.id}`)
        .setLabel('Cancel RSVP') // "Cancel RSVP" is fixed, no truncation needed
        .setStyle(ButtonStyle.Danger)
    );    
  }

  const files = [];
  if (event.eventImageUrl?.startsWith('http://localhost')) {
    try {
      const imageRes = await axiosLib.get(event.eventImageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageRes.data, 'binary');
      const imageName = path.basename(event.eventImageUrl);

      files.push({ attachment: imageBuffer, name: imageName });
      embed.setImage(`attachment://${imageName}`);
    } catch (err) {
      console.warn('⚠️ Failed to attach image:', err.message);
    }
  } else if (event.eventImageUrl) {
    embed.setImage(event.eventImageUrl);
  }

  const message = await channel.send({
    embeds: [embed],
    components: [row],
    files
  });

  const channelId = message.channel.id;
  const messageId = message.id;

  console.log("🧪 About to POST:", {
    eventId: event.id,
    messageId,
    channelId,
  });

  if (!channelId || typeof channelId !== 'string') {
    throw new Error(`❌ channelId is missing or invalid for event ${event.id}. Raw: ${JSON.stringify(message.channel)}`);
  }

  if (!messageId || typeof messageId !== 'string') {
    throw new Error(`❌ messageId is missing or invalid for event ${event.id}`);
  }

  try {
    console.log(`🛰️ Saving Discord message to DB: messageId=${messageId}, channelId=${channelId}`);

    await axios.post(`/api/events/${event.id}/discord-message`, {
      discordMessageId: messageId,
      discordChannelId: channelId
    }, {
      headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
    });
    console.log('✅ Successfully POSTed message info to backend');
  } catch (err) {
    console.error('❌ Failed to sync Discord message to backend:', err?.response?.data || err.message);
  }
}
function advanceAndPromptNextRole(session, message, isEdit) {
  session.currentRoleIndex++;  // 👈 force the increment
  const nextRole = getNextAvailableRole(session);
  if (!nextRole) {
    session.stage = 7;
    return finalizeEvent(message, session, isEdit);
  }

  const roleLabel = `${nextRole.icon} ${nextRole.name}`.slice(0, 80); // Truncate the label to 80 characters
  return message.reply(`➕ Add role **${roleLabel}**? (yes/no or skip)`);
}

async function finalizeEvent(message, session, isEdit) {
  const payload = {
    title: session.title,
    start: toUtcIso(session.start),
    end: toUtcIso(session.end),
    description: session.description,
    roles: session.roles,
    eventImageUrl: session.imageUrl,
  };

  try {
    if (isEdit) {
      await axios.put(`/api/events/bot/${session.eventId}`, payload, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` },
      });
      await message.reply(`✅ Event "${session.title}" updated successfully.`);
    } else {
      const res = await axios.post('/api/Events/bot', payload, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` },
      });
      const createdEvent = res.data;
      
      await message.reply(`✅ Event "${session.title}" created successfully.`);
      
      // ✅ Fetch full event (with roles + rsvps) before sending embed
      const fullEventRes = await axios.get(`/api/events/public/${createdEvent.id}`, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` },
      });
      
      await sendCustomEventEmbed(message.channel, fullEventRes.data);    
      
    }
  } catch (err) {
    console.error('Final save error:', err?.response?.data || err.message);
    await message.reply(`❌ Failed to ${isEdit ? 'update' : 'create'} event. ${err?.response?.data || 'Unknown error.'}`);
  }

  delete eventCreateSessions[message.author.id];
}

// Global conversation sessions for interactive event creation.
// In production, you might want a more robust/persistent solution.
const eventCreateSessions = {};

// Dedicated token for API calls from the bot.
// This token must include the "BotAccess": "true" claim.
const BOT_API_TOKEN = process.env.BOT_API_TOKEN;
console.log("BOT_API_TOKEN:", BOT_API_TOKEN);  // Logging token to verify it's loaded

// Initialize the bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// When the bot starts up
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Listen for messages
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // -------------------------------
  // INTERACTIVE EVENT CREATION FLOW
  // -------------------------------
  if (eventCreateSessions[message.author.id]) {
    const session = eventCreateSessions[message.author.id];
    const isEdit = session.mode === 'edit';
    // Allow cancellation at any time
    if (message.content.toLowerCase() === 'cancel') {
      delete eventCreateSessions[message.author.id];
      message.reply('✅ Event creation cancelled.');
      return;
    }

    switch (session.stage) {
      case 'edit-title':
        if (message.content.toLowerCase() !== 'skip') {
          session.title = message.content;
        }
        session.stage = 'edit-start';
        message.reply(`Enter a new **start time** (YYYY-MM-DDTHH:MM) or type "skip":`);
        break;

      case 'edit-start':
        if (message.content.toLowerCase() !== 'skip') {
          session.start = message.content;
        }
        session.stage = 'edit-end';
        message.reply(`Enter a new **end time** (YYYY-MM-DDTHH:MM) or type "skip":`);
        break;

      case 'edit-end':
        if (message.content.toLowerCase() !== 'skip') {
          session.end = message.content;
        }
        session.stage = 'edit-description';
        message.reply(`Enter a new **description**, or type "skip":`);
        break;

      case 'edit-description':
        if (message.content.toLowerCase() !== 'skip') {
          session.description = message.content;
        }
        session.stage = 'edit-image';
        message.reply(`Upload a new image or type an **image URL**, or "skip" to leave unchanged:`);
        break;

      case 'edit-image':
        if (message.attachments.size > 0) {
          const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
          session.imageUrl = image?.url || session.imageUrl;
        } else if (message.content.toLowerCase() !== 'skip') {
          session.imageUrl = message.content;
        }
      
        session.stage = 6;
        session.currentRoleIndex = 0;
      
        if (!isEdit) {
          const firstRole = getNextAvailableRole(session);
          if (!firstRole) {
            session.stage = 7;
            await finalizeEvent(message, session, isEdit);
            return;
          }
          message.reply(`📌 RSVP Role Setup\nInclude role **${firstRole.icon} ${firstRole.name}**? (yes/no or skip)`);
        } else {
          session.roleEditMode = 'reviewing-existing';
          session.reviewIndex = 0;
      
          const firstReviewRole = session.roles[session.reviewIndex];
          if (!firstReviewRole) {
            session.roleEditMode = 'adding-new';
            const role = getNextAvailableRole(session);
            if (!role) {
              session.stage = 7;
              await finalizeEvent(message, session, isEdit);
              return;
            }
            message.reply(`➕ Add new role **${role.icon} ${role.name}**? (yes/no or skip)`);
          } else {
            message.reply(`Keep role **${firstReviewRole.icon} ${firstReviewRole.name}**? (yes/no/skip)`);
            // Do NOT increment reviewIndex here. Wait for user response
          }          
        }
      
        break;
        
      case 1:
        // Stage 1: Collect Event Title
        session.title = message.content;
        session.stage = 2;
        message.reply('Great! What is the **start time** of the event? (Format: YYYY-MM-DDTHH:MM)');
        break;
      case 2:
        // Stage 2: Collect Start Time
        session.start = message.content; // (Optional: add date validation here)
        session.stage = 3;
        message.reply('Got it. What is the **end time** of the event? (Format: YYYY-MM-DDTHH:MM)');
        break;
      case 3:
        // Stage 3: Collect End Time
        session.end = message.content;
        session.stage = 4;
        message.reply('Please provide a **description** for the event.');
        break;
      case 4:
        // Stage 4: Collect Description
        session.description = message.content;
        session.stage = 5;
        message.reply('Now, either drag and drop an image into your message or type an **image URL**, or type "skip" if no image is needed.');
        break;
      case 5:
        if (message.attachments.size > 0) {
          const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
          session.imageUrl = image?.url || null;
        } else if (message.content.toLowerCase() !== 'skip') {
          session.imageUrl = message.content;
        }
      
        session.stage = 6;
        session.currentRoleIndex = 0;
      
        const firstRole = getNextAvailableRole(session);
        if (!firstRole) {
          session.stage = 7;
          await finalizeEvent(message, session, false);
          return;
        }
      
        message.reply(`📌 RSVP Role Setup\nInclude role **${firstRole.icon} ${firstRole.name}**? (yes/no or skip)`);
        break;
        
      case 6:
        const input = message.content.toLowerCase();
      
        // === REVIEWING EXISTING ROLES ===
        if (isEdit && session.roleEditMode === 'reviewing-existing') {
          const existing = session.roles[session.reviewIndex];
          if (!existing) {
            session.roleEditMode = 'adding-new';
            session.currentRoleIndex = 0;

            // 🔁 Skip duplicates before prompting
            while (
              session.currentRoleIndex < session.availableRoles.length &&
              session.roles.some(r => r.name === session.availableRoles[session.currentRoleIndex].name)
            ) {
              session.currentRoleIndex++;
            }

            const role = session.availableRoles[session.currentRoleIndex];
            if (!role) {
              session.stage = 7;
              await finalizeEvent(message, session, isEdit);
              return;
            }

            message.reply(`➕ Add new role **${role.icon} ${role.name}**? (yes/no or skip)`);
            return;
          }
      
          if (input === 'yes') {
            session.reviewIndex++;
          } else if (input === 'no') {
            session.roles.splice(session.reviewIndex, 1);
          } else if (input === 'skip') {
            session.reviewIndex++;
          } else {
            message.reply('❓ Reply "yes" to keep, "no" to remove, or "skip" to skip this role.');
            return;
          }
      
          const next = session.roles[session.reviewIndex];
          if (next) {
            message.reply(`Keep role **${next.icon} ${next.name}**? (yes/no/skip)`);
            return;
          }
          
          // 👇 This part runs only if you're done reviewing all existing roles
          session.roleEditMode = 'adding-new';
          session.currentRoleIndex = 0;
          
          const newRole = getNextAvailableRole(session);
          if (!newRole) {
            session.stage = 7;
            await finalizeEvent(message, session, isEdit); // 👈 make sure this is awaited
            return;
          }
          
          message.reply(`➕ Add new role **${newRole.icon} ${newRole.name}**? (yes/no or skip)`);
          return;          
        }
      
        const roleToOffer = getNextAvailableRole(session);

        if (!roleToOffer) {
          session.stage = 7;
          await finalizeEvent(message, session, isEdit);
          return;
        }
        
        if (input === 'yes') {
          session.stage = 'role-capacity';
          session.awaitingRole = roleToOffer;
          message.reply(`How many participants can join as **${roleToOffer.icon} ${roleToOffer.name}**?`);
          return;
        } else if (input === 'no') {
          return await advanceAndPromptNextRole(session, message, isEdit);
        }
        else if (input === 'skip') {
          return await advanceAndPromptNextRole(session, message, isEdit);
        }
        
            

      case 7:
        await finalizeEvent(message, session, isEdit);
        break;
        
      case 'role-capacity':
        const cap = parseInt(message.content);
        if (isNaN(cap) || cap <= 0) {
          message.reply('❌ Please enter a valid number greater than 0.');
          return;
        }
      
        session.roles.push({
          name: session.awaitingRole.name,
          icon: session.awaitingRole.icon,
          capacity: cap,
        });
      
        session.currentRoleIndex++;
        const nextRole = getNextAvailableRole(session);

        if (nextRole) {
          session.stage = 6;
          message.reply(`Include the role **${nextRole.icon} ${nextRole.name}**? (yes/no or skip)`);
        } else {
          session.stage = 7;
          await finalizeEvent(message, session, isEdit);
        }

        break;
      default:
        break;
    }
    return; // Stop processing further commands while in an interactive session.
  }
  // -------------------------
  // Command: !eventlist - shows list of upcoming events
  // -------------------------
  if (message.content.toLowerCase() === '!eventlist') {
    try {
      const res = await axios.get('/api/events', {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` },
      });

      const events = res.data;

      if (!events.length) {
        message.reply('📭 No upcoming events found.');
        return;
      }

      const maxToShow = 10;
      const list = events
        .slice(0, maxToShow)
        .map(event => {
          const date = new Date(event.start).toLocaleString();
          return `🆔 \`${event.id}\` - **${event.title}** (${date})`;
        })
        .join('\n');

      message.reply(`📅 **Upcoming Events:**\n${list}\n\nℹ️ Use \`!eventedit <id>\` to edit one.`);
    } catch (err) {
      console.error('Failed to list events:', err?.response?.data || err.message);
      message.reply('❌ Failed to fetch events.');
    }
    return;
  }

  // -------------------------
  // RSVP Command: !rsvp 123 [Role]
  // -------------------------
  if (message.content.startsWith('!rsvp')) {
    const args = message.content.split(' ');
    const eventId = args[1];
    if (!eventId) {
      message.reply('❌ You must provide an event ID. Example: `!rsvp 123`');
      return;
    }
    const role = args[2] || "Attendee";
    try {
      await axios.post('/api/events/rsvp', {
        eventId: parseInt(eventId),
        username: message.author.username,
        role: role
      });
      message.reply(`✅ You RSVPed for event ${eventId} with role: ${role}`);
    } catch (err) {
      console.error('RSVP Error:', err?.response?.data || err.message);
      message.reply(`❌ Failed to RSVP. ${err?.response?.data || 'Unknown error.'}`);
    }
    return;
  }

  // -------------------------
  // Command: !eventcreate - to start interactive event creation
  // -------------------------
  if (message.content.toLowerCase().startsWith('!eventcreate')) {
    try {
      const res = await axios.get('/api/events/rsvp-options');
      const availableRoles = res.data;
  
      eventCreateSessions[message.author.id] = {
        stage: 1,
        title: '',
        start: '',
        end: '',
        description: '',
        imageUrl: null,
        roles: [],
        currentRoleIndex: 0,
        availableRoles, // now pulled from API
      };
  
      message.reply('Let’s create a new event! What is the **event title**? (Type "cancel" at any time to cancel)');
    } catch (err) {
      console.error('❌ Failed to fetch RSVP roles:', err.message);
      message.reply('❌ Could not start event creation. Try again later.');
    }
  
    return;
  }
  
  
  // -------------------------
  // (Optional) Direct Command: !createevent "Event Title" "Start" "End" "Description" ["Optional Image URL"]
  // -------------------------
  if (message.content.startsWith('!createevent')) {
    const regex = /"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"(?:\s+"([^"]+)")?/;
    const matches = message.content.match(regex);
    if (!matches) {
      message.reply('❌ Usage: !createevent "Event Title" "Start Time" "End Time" "Description" ["Optional Image URL"]');
      return;
    }
    const title = matches[1];
    const start = matches[2];
    const end = matches[3];
    const description = matches[4];
    const imageUrl = matches[5] || null;
    try {
      const payload = {
        title,
        start,
        end,
        description,
        roles: [],
        eventImageUrl: imageUrl
      };
      // Send to the bot-only endpoint using the dedicated token.
      await axios.post('/api/Events/bot', payload, {
        headers: {
          Authorization: `Bearer ${BOT_API_TOKEN}`
        }
      });
      message.reply(`✅ Event "${title}" created successfully.`);
    } catch (err) {
      console.error('Event creation error:', err?.response?.data || err.message);
      message.reply(`❌ Failed to create event. ${err?.response?.data || 'Unknown error.'}`);
    }
    return;
  }

    // -------------------------
  // Command: !eventedit [eventId]
  // -------------------------
  if (message.content.startsWith('!eventedit')) {
    const args = message.content.split(' ');
    const eventId = parseInt(args[1]);
    if (isNaN(eventId)) {
      message.reply('❌ Invalid event ID.');
      return;
    }

    try {
      const res = await axios.get(`/api/events/${eventId}`, {
        headers: {
          Authorization: `Bearer ${BOT_API_TOKEN}`
        }
      });
      const event = res.data;

      const rolesRes = await axios.get('/api/events/rsvp-options');

      eventCreateSessions[message.author.id] = {
        mode: 'edit',
        stage: 'edit-title',
        eventId,
        title: event.title,
        start: event.start,
        end: event.end,
        description: event.description || '',
        imageUrl: event.eventImageUrl || null,
        roles: event.roles || [], // existing RSVP roles
        availableRoles: rolesRes.data,
        currentRoleIndex: 0,
        roleEditMode: 'reviewing-existing', // 👈 NEW: used to control RSVP flow
        reviewIndex: 0 // 👈 NEW: track index of reviewing existing roles
      };
      

      message.reply(`✏️ Editing Event **${event.title}**.\nEnter a new **title**, or type "skip" to keep existing.`);
    } catch (err) {
      console.error('Error fetching event:', err?.response?.data || err.message);
      message.reply('❌ Failed to fetch event. Make sure the ID is valid.');
    }
    return;
  }

  if (message.content === '!testchannel') {
    try {
      const testChannelId = '1298331987584483500';
      const testChannel = await client.channels.fetch(testChannelId);
      console.log(`✅ Bot can access channel: ${testChannel.name} (${testChannel.id})`);
      await message.reply(`✅ Bot can access channel: ${testChannel.name}`);
    } catch (err) {
      console.error('❌ Failed to fetch channel:', err.message);
      await message.reply('❌ Bot could NOT access the channel. Check logs.');
    }
    return;
  }

  // Inside your existing client.on('messageCreate') at the top level
  if (message.content.startsWith('!fetchmsg')) {
    const parts = message.content.split(' ');
    const messageId = parts[1];
    const channelId = parts[2] || message.channel.id;
  
    try {
      const channel = await client.channels.fetch(channelId);
      const msg = await channel.messages.fetch(messageId);
  
      // 🧪 TEST: try editing the message manually
      await msg.edit({
        embeds: [{
          title: '🧪 Manual Test',
          description: 'This is a test edit from `!fetchmsg`',
          color: 0x00ff00
        }]
      });
  
      await message.reply(`✅ Edited message successfully.`);
    } catch (err) {
      console.error('❌ Fetch or edit error:', err?.message || err);
      await message.reply('❌ Failed to fetch or edit message. Check console.');
    }
    return;
  }
  
  if (message.content.startsWith('!checkchannelaccess')) {
    const channelId = message.content.split(' ')[1];
    try {
      const channel = await client.channels.fetch(String(channelId));
      await message.reply(`✅ Can access: ${channel.name} (${channel.id})`);
    } catch (err) {
      console.error(`❌ Cannot access channel ${channelId}:`, err.message);
      await message.reply(`❌ Cannot access channel ${channelId}.`);
    }
  }

  if (message.content.startsWith('!updateevent')) {
    const parts = message.content.split(' ');
    const eventId = parseInt(parts[1]);
  
    if (isNaN(eventId)) {
      message.reply('❌ Invalid event ID.');
      return;
    }
  
    try {
      const res = await axios.get(`/api/events/public/${eventId}`, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
      });
  
      const fullEvent = res.data;  
      const channelId = fullEvent.discordChannelId;
      const messageId = fullEvent.discordMessageId;

      if (!channelId || !messageId) {
        console.warn("⚠️ Missing Discord IDs on event:", fullEvent.id);
        return message.reply('⚠️ Cannot update event: Discord channel or message ID is missing.');
      }      
  
      console.log("🧪 Fetching message:", {
        channelId,
        messageId,
        fullEvent
      });
  
      // 👇 TEMP: FORCE CHANNEL ID FIX HERE
      const forcedChannelId = '1298331987584483500'; // 👈 this is the correct parent channel
      const channel = await client.channels.fetch(forcedChannelId);
      const msg = await channel.messages.fetch(String(messageId));
  
      const { embeds, components } = buildEventEmbed(fullEvent);
      await msg.edit({ embeds, components });
  
      message.reply(`✅ Event ${eventId} embed updated.`);
    } catch (err) {
      console.error('❌ Update failed:', err?.response?.data || err.message);
      message.reply('❌ Failed to update event embed.');
    }
  }

  if (message.content === '!listchannels') {
    const channels = message.guild.channels.cache;
    channels.forEach(channel => {
      message.channel.send(`Channel Name: ${channel.name}, Channel ID: ${channel.id}`);
    });
  }
  
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  // RSVP handler: rsvp-<eventId>-<roleName>
  if (customId.startsWith('rsvp-')) {
    const [, eventIdStr, ...roleParts] = customId.split('-');
    const role = roleParts.join('-');
    const eventId = parseInt(eventIdStr);

    try {
      await interaction.deferReply({ ephemeral: true }); // ⏳ Reserve the reply
    
      await axios.post('/api/events/rsvp', {
        eventId,
        username: interaction.user.username,
        discordId: interaction.user.id,
        avatarUrl: interaction.user.displayAvatarURL({ dynamic: true }),
        attending: true,
        role,
        source: 'discord'
      }, {
        headers: {
          Authorization: `Bearer ${BOT_API_TOKEN}`
        }
      });
    
      const updatedRes = await axios.get(`/api/events/public/${eventId}`, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
      });
    
      const updatedEvent = updatedRes.data;

      if (!updatedEvent.discordChannelId || !updatedEvent.discordMessageId) {
        console.warn("⚠️ Missing Discord IDs on event:", updatedEvent.id);
        return await interaction.editReply({
          content: `⚠️ Could not update event message because channel or message ID is missing.`,
        });
      }      
    
      if (updatedEvent.discordChannelId && updatedEvent.discordMessageId) {
        const channelId = String(updatedEvent.discordChannelId);
        const messageId = String(updatedEvent.discordMessageId);
    
        // 🔍 DEBUG LOGGING
        console.log("📦 Event from API:", updatedEvent);
        console.log("📢 Attempting to fetch channel:", channelId);
        console.log("🧪 Type of channelId:", typeof channelId);
        console.log("🧪 Bot is in guilds:", client.guilds.cache.map(g => g.id));
        console.log("🧪 Is channel cached:", client.channels.cache.has(channelId));
    
        const targetChannel = await client.channels.fetch(channelId);
        console.log("✅ Successfully fetched channel:", targetChannel?.name || '[no name]');
    
        const targetMessage = await targetChannel.messages.fetch(messageId);
        console.log("✅ Successfully fetched message:", targetMessage.id);
    
        const { embeds, components } = buildEventEmbed(updatedEvent);
        await targetMessage.edit({ embeds, components });
        console.log("✅ Message updated after RSVP");
      }
    
      await interaction.editReply({
        content: `✅ You RSVPed for **${role}** on event ${eventId}`
      });
    
    } catch (err) {
      console.error('❌ RSVP + Update failed:', err?.response?.data || err.message);
      if (err?.stack) console.error(err.stack);
    
      try {
        await interaction.editReply({
          content: `❌ Failed to RSVP or update message. ${err?.response?.data || 'Unknown error.'}`
        });
      } catch (e) {
        console.warn("⚠️ Could not send fallback reply:", e.message);
      }
    }
    
  }

  // Cancel RSVP handler: cancel-<eventId>
  else if (customId.startsWith('cancel-')) {
    const eventId = parseInt(customId.split('-')[1]);

    try {
      // ⛏ Fetch event + user's current RSVP role
      const eventRes = await axios.get(`/api/events/public/${eventId}`, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
      });
      const eventData = eventRes.data;
      const userRsvp = eventData.rsvps?.find(r => r.discordId === interaction.user.id && r.attending);

      if (!userRsvp) {
        return await interaction.reply({
          content: `⚠️ No active RSVP found to cancel.`,
          ephemeral: true
        });
      }

      // 🧨 Now cancel it, including the role
      await axios.post('/api/events/rsvp', {
        eventId,
        username: interaction.user.username,
        attending: false,
        source: 'discord',
        discordId: interaction.user.id,
        role: userRsvp.role
      }, {
        headers: {
          Authorization: `Bearer ${BOT_API_TOKEN}`
        }
      });

      await interaction.reply({
        content: `❌ Your RSVP was canceled.`,
        flags: 64 // 64 = ephemeral
      });

      try {
        const updatedRes = await axios.get(`/api/events/public/${eventId}`, {
          headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
        });
        const updatedEvent = updatedRes.data;
        
        if (!updatedEvent.discordChannelId || !updatedEvent.discordMessageId) {
          console.warn("⚠️ Missing Discord IDs on event:", updatedEvent.id);
          return;
        }

        console.log('📦 From API:', {
          channelId: updatedEvent.discordChannelId,
          messageId: updatedEvent.discordMessageId,
          title: updatedEvent.title
        });
        if (updatedEvent.discordChannelId && updatedEvent.discordMessageId) {
          const channelId = String(updatedEvent.discordChannelId);
          const messageId = String(updatedEvent.discordMessageId);
        
          // ✅ Confirm logging like the test
          console.log("📢 Attempting to fetch channel:", channelId);
          console.log("🧪 Type of channelId:", typeof channelId);
          console.log("🧪 Bot is in guilds:", client.guilds.cache.map(g => g.id));
        
          try {
            const targetChannel = await client.channels.fetch(channelId);
            const targetMessage = await targetChannel.messages.fetch(messageId);
        
            const { embeds, components } = buildEventEmbed(updatedEvent);
            await targetMessage.edit({ embeds, components });
        
            console.log("✅ Message successfully edited after RSVP");
          } catch (err) {
            console.error("❌ Fetch/Edit failed in RSVP handler:", err.message || err);
          }
        }
        
        
      } catch (err) {
        console.error('❌ Failed to update Discord message after RSVP:', err?.response?.data || err.message);
      }      

    } catch (err) {
      console.error('Cancel RSVP error:', err?.response?.data || err.message);
      await interaction.reply({
        content: `❌ Failed to cancel RSVP. ${err?.response?.data || 'Unknown error.'}`,
        ephemeral: true
      });
    }
  }
});

app.post('/rsvp-update', async (req, res) => {
  const { eventId, channelId, messageId } = req.body;

  if (!eventId || !channelId || !messageId) {
    console.warn('❌ Missing data in RSVP update webhook');
    return res.status(400).send('Missing data');
  }

  try {
    const updatedRes = await axios.get(`/api/events/public/${eventId}`, {
      headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
    });

    const updatedEvent = updatedRes.data;
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);

    const { embeds, components } = buildEventEmbed(updatedEvent);
    await message.edit({ embeds, components });

    console.log(`✅ Event ${eventId} embed updated via webhook`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Failed to update message from webhook:', err.message || err);
    res.status(500).send('Failed to update');
  }
});
app.post('/event-create', async (req, res) => {
  const { eventId } = req.body;
  if (!eventId) return res.status(400).send("Missing eventId");

  try {
    const res2 = await axios.get(`/api/events/public/${eventId}`, {
      headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
    });

    const event = res2.data;
    const channelId = process.env.DISCORD_DEFAULT_CHANNEL_ID || '1298331987584483500';

    if (!channelId) throw new Error("DISCORD_DEFAULT_CHANNEL_ID not set");

    const channel = await client.channels.fetch(channelId);
    await sendCustomEventEmbed(channel, event);
    console.log(`✅ Posted new event ${event.title} to Discord`);

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Failed to post new event to Discord:', {
      message: err?.message,
      response: err?.response?.data,
      stack: err?.stack
    });
    res.status(500).send("Failed");
  }
});

// Start the webhook server
app.listen(3045, () => {
  console.log('📡 Bot webhook server running on port 3045');
});

client.login(process.env.DISCORD_TOKEN);

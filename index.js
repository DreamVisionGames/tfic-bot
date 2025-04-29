require('dotenv').config();
const COMMAND_PREFIX = '!';
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
axios.defaults.baseURL = 'https://tfic-org-website-production.up.railway.app';
// At the top of your bot file
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { DateTime } = require('luxon');

const TIMEZONES = {
  1: 'America/New_York',      // Eastern
  2: 'America/Chicago',       // Central
  3: 'America/Denver',        // Mountain
  4: 'America/Los_Angeles',   // Pacific
  5: 'America/Sao_Paulo',     // Brazil
  6: 'UTC',                   // UTC
  7: 'Europe/London',         // UK
  8: 'Europe/Paris',          // Central Europe
  9: 'Europe/Moscow',         // Moscow
 10: 'Asia/Dubai',            // UAE
 11: 'Asia/Kolkata',          // India
 12: 'Asia/Shanghai',         // China
 13: 'Asia/Tokyo',            // Japan
 14: 'Asia/Seoul',            // South Korea
 15: 'Australia/Sydney',      // Australia East
 16: 'Pacific/Auckland',      // New Zealand
 17: 'Africa/Johannesburg',   // South Africa
};

function parseUserTime(text, timezone) {
  try {
    const cleanedText = text
      .replace(/(\d{1,2})(st|nd|rd|th)/gi, '$1') // remove 1st, 2nd, etc
      .replace(/\s*,\s*/, ', '); // ensure exactly one space after comma

    // Try parsing more flexibly
    const dt = DateTime.fromFormat(cleanedText, 'EEEE MMMM d, h:mma', { zone: timezone, locale: 'en' });

    if (dt.isValid) {
      return dt.toUTC().toISO();
    }

    // Second attempt: allow missing weekday
    const dt2 = DateTime.fromFormat(cleanedText, 'MMMM d, h:mma', { zone: timezone, locale: 'en' });

    if (dt2.isValid) {
      return dt2.toUTC().toISO();
    }

    return null;
  } catch (err) {
    return null;
  }
}


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
              const roleLine = `**${role.icon} ${role.name}** — ${count}/${role.capacity > 0 ? role.capacity : '∞'}`;
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
    const isFull = role.capacity > 0 && current >= role.capacity;

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
              const roleLine = `**${role.icon} ${role.name}** — ${count}/${role.capacity > 0 ? role.capacity : '∞'}`;
              const attendeeList = attendees.length ? `\n${attendees.join('\n')}` : '';

              return `${roleLine}${attendeeList}`;
            }).join('\n\n')
          : 'No roles configured.'
      }
    );

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
          .setLabel(`${role.icon || ''} ${role.name || ''}`.trim().slice(0, 80))
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
  } else if (event.eventImageUrl && (event.eventImageUrl.startsWith('http://') || event.eventImageUrl.startsWith('https://'))) {
    embed.setImage(event.eventImageUrl);
  }  

  const message = await channel.send({
    embeds: [embed],
    components: rows,
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
  session.currentRoleIndex++;
  const nextRole = getNextAvailableRole(session);

  if (!nextRole) {
    // No more roles to add — now ask if they want to remove
    session.stage = 'review-existing-roles';
    return message.reply(
      `✅ You've added all roles.\n\n` +
      `Would you like to **remove** any roles before finalizing?\n\nType **yes** or **no**.`
    );
  }

  const roleLabel = `${nextRole.icon} ${nextRole.name}`.slice(0, 80);
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

      try {
        const updatedEventRes = await axios.get(`/api/events/public/${session.eventId}`, {
          headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
        });
        const updatedEvent = updatedEventRes.data;
      
        if (updatedEvent.discordChannelId && updatedEvent.discordMessageId) {
          const channel = await client.channels.fetch(updatedEvent.discordChannelId);
          const discordMessage = await channel.messages.fetch(updatedEvent.discordMessageId);
      
          const { embeds, components } = buildEventEmbed(updatedEvent);
          await discordMessage.edit({ embeds, components });
      
          console.log(`✅ Updated Discord message for event ${session.eventId}`);
        } else {
          console.warn(`⚠️ No Discord message linked for event ${session.eventId}`);
        }
      } catch (err) {
        console.error(`❌ Failed to update Discord message after event edit:`, err?.response?.data || err.message);
      }
      
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
      
      const targetChannelId = session.postInChannelId || process.env.EVENTS_CHANNEL_ID || message.channel.id;
      const targetChannel = await client.channels.fetch(targetChannelId);
      await sendCustomEventEmbed(targetChannel, fullEventRes.data); 
      
    }
  } catch (err) {
    console.error('Final save error:', err?.response?.data || err.message);
    await message.reply(`❌ Failed to ${isEdit ? 'update' : 'create'} event. ${err?.response?.data || 'Unknown error.'}`);
  }
  clearTimeout(session.timeoutId);
  delete eventCreateSessions[message.author.id];
}
function promptNextAvailableRole(message, session) {
  const roleOptions = session.availableRoles.map((r, index) => `${index + 1}. ${r.icon} ${r.name}`).join('\n');
  const menu =
    `🎯 **Pick a role to add:**\n\n${roleOptions}\n${session.availableRoles.length + 1}. 🚫 Continue without adding more roles\n\nType the number of the role you want to add.`;

  message.reply(menu);
}

// Global conversation sessions for interactive event creation.
// In production, you might want a more robust/persistent solution.
const eventCreateSessions = {};
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
function resetSessionTimeout(userId, message) {
  const session = eventCreateSessions[userId];
  if (!session) return;

  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  session.timeoutId = setTimeout(() => {
    console.log(`⌛ Session timed out for user ${userId}`);
    delete eventCreateSessions[userId];
    message.reply('⌛ Your event creation session has expired due to inactivity.');
  }, SESSION_TIMEOUT_MS);
}

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
  // 🚫 Ignore messages from other bots
  if (message.author.bot) return;

  // 🚫 Only respond if the message starts with the COMMAND_PREFIX (which is '!')
  if (!message.content.startsWith(COMMAND_PREFIX) && !eventCreateSessions[message.author.id]) return;

  // 📋 Now safe to continue handling the command

  // 🔵 Add this inside client.on('messageCreate') alongside your other commands
  if (message.content.toLowerCase() === COMMAND_PREFIX + 'commands' || message.content.toLowerCase() === COMMAND_PREFIX + 'help') {
    message.reply(`📜 **Available Bot Commands:**
    - \`!eventcreate\` — Create a new event interactively
    - \`!eventedit <eventId>\` — Edit an existing event
    - \`!eventlist\` — Show upcoming events
    - \`!rsvp <eventId> [role]\` — RSVP to an event
    - \`!fetchmsg <messageId> [channelId]\` — Fetch and manually edit a message (admin)
    - \`!checkchannelaccess <channelId>\` — Test if bot can see a channel
    - \`!updateevent <eventId>\` — Manually refresh an event embed
    - \`!deleteevent <eventId>\` — Delete an event manually 🗑️
    
    🛠️ **Button Actions Now Available:**
    - Cancel RSVP ❌
    
    ℹ️ Type \`cancel\` anytime during event creation to stop.
    `);
    return;
  } 
  // -------------------------------
  // INTERACTIVE EVENT CREATION FLOW
  // -------------------------------
  if (eventCreateSessions[message.author.id]) {
    const session = eventCreateSessions[message.author.id];
    const isEdit = session.mode === 'edit';
    resetSessionTimeout(message.author.id, message);

    // Allow cancellation at any time
    if (message.content.toLowerCase() === 'cancel') {
      clearTimeout(eventCreateSessions[message.author.id]?.timeoutId);
      delete eventCreateSessions[message.author.id];
      message.reply('✅ Event creation cancelled.');
      return;
    }
    
    switch (session.stage) {
      case 'awaiting-channel':
      try {
        // ✅ Always allow cancel first
        if (message.content.toLowerCase() === 'cancel') {
          clearTimeout(eventCreateSessions[message.author.id]?.timeoutId);
          delete eventCreateSessions[message.author.id];
          await message.reply('✅ Event creation cancelled.');
          return;
        }

        const mentionedChannel = message.mentions.channels.first();

        if (!mentionedChannel) {
          await message.reply('❌ Please mention a channel properly (use #channel mention, not just typing the name).');
          return;
        }

        session.postInChannelId = mentionedChannel.id;
        session.stage = 1; // Next: title
        await message.reply(`✅ Got it! Events will be posted in **#${mentionedChannel.name}**.\n\nNow, what is the **event title**?`);
        return; // <-- 🔥 important
      } catch (err) {
        console.error('❌ Error during awaiting-channel phase:', err);
        await message.reply('❌ Unexpected error handling your channel input. Try again.');
      }
      return;

      case 'edit-title':
        if (message.content.toLowerCase() !== 'skip') {
          session.title = message.content;
        }
        session.stage = 'timezone-start'; // 👈 after title, go ask for timezone
        message.reply(
          "🕓 What timezone is the start time in?\n" +
          "**1** = Eastern (New York)\n" +
          "**2** = Central (Chicago)\n" +
          "**3** = Mountain (Denver)\n" +
          "**4** = Pacific (Los Angeles)\n" +
          "**5** = Brazil (Sao Paulo)\n" +
          "**6** = UTC\n" +
          "**7** = UK (London)\n" +
          "**8** = Central Europe (Paris)\n" +
          "**9** = Moscow\n" +
          "**10** = UAE (Dubai)\n" +
          "**11** = India (Kolkata)\n" +
          "**12** = China (Shanghai)\n" +
          "**13** = Japan (Tokyo)\n" +
          "**14** = South Korea (Seoul)\n" +
          "**15** = Australia East (Sydney)\n" +
          "**16** = New Zealand (Auckland)\n" +
          "**17** = South Africa (Johannesburg)\n\n" +
          "Type the number corresponding to your timezone:"
        );
        break;
      case 1: // New Event: Collect Title
        session.title = message.content;
        session.stage = 'timezone-start';
        message.reply(
          "🕓 What timezone is the time in?\n" +
          "**1** = Eastern (New York)\n" +
          "**2** = Central (Chicago)\n" +
          "**3** = Mountain (Denver)\n" +
          "**4** = Pacific (Los Angeles)\n" +
          "**5** = Brazil (Sao Paulo)\n" +
          "**6** = UTC\n" +
          "**7** = UK (London)\n" +
          "**8** = Central Europe (Paris)\n" +
          "**9** = Moscow\n" +
          "**10** = UAE (Dubai)\n" +
          "**11** = India (Kolkata)\n" +
          "**12** = China (Shanghai)\n" +
          "**13** = Japan (Tokyo)\n" +
          "**14** = South Korea (Seoul)\n" +
          "**15** = Australia East (Sydney)\n" +
          "**16** = New Zealand (Auckland)\n" +
          "**17** = South Africa (Johannesburg)\n\n" +
          "Type the number corresponding to your timezone:"
        );        
        return; // <-- 🔥 important
      case 'timezone-start':
        const tzStart = parseInt(message.content);
        if (!TIMEZONES[tzStart]) {
          return message.reply('❌ Invalid timezone number. Please pick from 1 to 17.');
        }
        session.startTimezone = TIMEZONES[tzStart];
        session.stage = 'input-start-time';
        await message.reply('📝 Now type the **start time** (example: "Sunday June 5, 2:30pm")');
        return;

    
      case 'input-start-time':
        const parsedStart = parseUserTime(message.content, session.startTimezone);
        if (!parsedStart) {
          return message.reply('❌ Could not parse that time. Try again like: "Sunday June 5, 2:30pm"');
        }
        session.start = parsedStart;
        session.stage = 'timezone-end';
        message.reply(
          "🕓 What timezone is the time in?\n" +
          "**1** = Eastern (New York)\n" +
          "**2** = Central (Chicago)\n" +
          "**3** = Mountain (Denver)\n" +
          "**4** = Pacific (Los Angeles)\n" +
          "**5** = Brazil (Sao Paulo)\n" +
          "**6** = UTC\n" +
          "**7** = UK (London)\n" +
          "**8** = Central Europe (Paris)\n" +
          "**9** = Moscow\n" +
          "**10** = UAE (Dubai)\n" +
          "**11** = India (Kolkata)\n" +
          "**12** = China (Shanghai)\n" +
          "**13** = Japan (Tokyo)\n" +
          "**14** = South Korea (Seoul)\n" +
          "**15** = Australia East (Sydney)\n" +
          "**16** = New Zealand (Auckland)\n" +
          "**17** = South Africa (Johannesburg)\n\n" +
          "Type the number corresponding to your timezone:"
        );        
        break;
    
      case 'timezone-end':
        const tzEnd = parseInt(message.content);
        if (!TIMEZONES[tzEnd]) {
          return message.reply('❌ Invalid timezone number. Please pick from 1 to 17.');
        }
        session.endTimezone = TIMEZONES[tzEnd];
        session.stage = 'input-end-time';
        message.reply('📝 Now type the **end time** (example: "Sunday June 5th 5:00pm")');
        break;
    
      case 'input-end-time':
        const parsedEnd = parseUserTime(message.content, session.endTimezone);
        if (!parsedEnd) {
          return message.reply('❌ Could not parse that time. Try again like: "Sunday June 5th 5:00pm"');
        }
        session.end = parsedEnd;
        session.stage = 4;
        message.reply('Please provide a **description** for the event.');
        break;
    
      case 4: // Description
        session.description = message.content;
        session.stage = 5;
        message.reply('Now, either drag and drop an image into your message or type an **image URL**, or type "skip" if no image is needed.');
        break;
    
      case 5: // Image Upload
        if (message.attachments.size > 0) {
          const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
          session.imageUrl = image?.url || null;
        } else if (message.content.toLowerCase() !== 'skip') {
          session.imageUrl = message.content;
        }
        session.stage = 'select-role';
        promptNextAvailableRole(message, session);
        break;
    
      case 'select-role': // ⭐⭐ New Role Menu
        const selection = parseInt(message.content.trim());
    
        if (isNaN(selection) || selection < 1 || selection > session.availableRoles.length + 1) {
          return message.reply('❌ Invalid selection. Please pick a valid number.');
        }
    
        if (selection === session.availableRoles.length + 1) {
          if (session.roles.length === 0) {
            return message.reply('⚠️ You must add at least one role before continuing.');
          }
          session.stage = 'review-existing-roles';
          return message.reply(
            `✅ You've added all roles.\n\nWould you like to **remove** any roles before finalizing?\n\nType **yes** or **no**.`
          );
        }        
    
        session.awaitingRole = session.availableRoles[selection - 1];
        session.stage = 'role-capacity';
        message.reply(`How many participants can join as **${session.awaitingRole.icon} ${session.awaitingRole.name}**? (Type a number or "none" for unlimited)`);
        break;
    
      case 'role-capacity':
        let capacity = message.content.trim().toLowerCase();
        if (capacity === 'none') {
          capacity = 0;
        } else {
          capacity = parseInt(capacity);
          if (isNaN(capacity) || capacity < 0) {
            return message.reply('❌ Invalid number. Please type a valid number or "none".');
          }
        }
    
        session.roles.push({
          name: session.awaitingRole.name,
          icon: session.awaitingRole.icon,
          department: session.awaitingRole.department,
          capacity
        });
    
        session.availableRoles = session.availableRoles.filter(r => r.name !== session.awaitingRole.name);
    
        if (session.availableRoles.length === 0) {
          session.stage = 7;
          await finalizeEvent(message, session, isEdit);
          return;
        }
    
        session.stage = 'select-role';
        promptNextAvailableRole(message, session);
        break;
    
      case 7: // Finalize Event
        await finalizeEvent(message, session, isEdit);
        break;
        case 'review-existing-roles':
          if (message.content.toLowerCase() === 'yes') {
            if (session.roles.length === 0) {
              return message.reply('⚠️ No roles to remove.');
            }
            session.stage = 'remove-role';
            const roleList = session.roles.map((r, idx) => `${idx + 1}. ${r.icon} ${r.name}`).join('\n');
            return message.reply(
              `🎯 **Current Roles:**\n\n${roleList}\n\nType the number of the role you want to remove.`
            );
          } else if (message.content.toLowerCase() === 'no') {
            if (session.roles.length === 0) {
              return message.reply('⚠️ You must add at least one role.');
            }
            session.stage = 7;
            return finalizeEvent(message, session, isEdit);
          } else {
            return message.reply('❌ Please type **yes** or **no**.');
          }
        
          case 'remove-role':
            const removeIdx = parseInt(message.content.trim()) - 1;
            if (isNaN(removeIdx) || removeIdx < 0 || removeIdx >= session.roles.length) {
              return message.reply('❌ Invalid selection. Type the number of the role you want to remove.');
            }
            
            const removedRole = session.roles.splice(removeIdx, 1)[0];
          
            if (session.availableRoles) {
              session.availableRoles.push({
                name: removedRole.name,
                icon: removedRole.icon,
                department: removedRole.department,
              });
            }
          
            if (session.roles.length === 0) {
              return message.reply('⚠️ You have removed all roles. Please add at least one before finalizing.');
            }
          
            session.stage = 'review-existing-roles';
            const newList = session.roles.map((r, idx) => `${idx + 1}. ${r.icon} ${r.name}`).join('\n');
            return message.reply(
              `✅ Removed **${removedRole.name}**.\n\n🎯 **Current Roles:**\n\n${newList}\n\nType the number of another role to remove, or type **no** to finalize.`
            );
        
      default:
        break;
    }
    
    return; // Stop processing further commands while in an interactive session.
  }
  // -------------------------
  // Command: !eventlist - shows list of upcoming events
  // -------------------------
  if (message.content.toLowerCase() === COMMAND_PREFIX + 'eventlist') {
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
  if (message.content.startsWith(COMMAND_PREFIX + 'rsvp')) {
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
  if (message.content.toLowerCase().startsWith(COMMAND_PREFIX + 'eventcreate')){
    try {
      const res = await axios.get('/api/events/rsvp-options');
      const availableRoles = res.data;
  
      eventCreateSessions[message.author.id] = {
        stage: 'awaiting-channel',
        title: '',
        start: '',
        end: '',
        description: '',
        imageUrl: null,
        roles: [],
        currentRoleIndex: 0,
        availableRoles,
        postInChannelId: null, // 🆕 where to post
        timeoutId: null // 🔥 add this
      };
      
      message.reply('📢 Where should I post the event?\n\nMention a channel (like #events) or type a Channel ID.\n\n(Type "cancel" at any time to cancel)');
    } catch (err) {
      console.error('❌ Failed to fetch RSVP roles:', err.message);
      message.reply('❌ Could not start event creation. Try again later.');
    }
  
    return;
  }
  
  
  // -------------------------
  // (Optional) Direct Command: !createevent "Event Title" "Start" "End" "Description" ["Optional Image URL"]
  // -------------------------
  if (message.content.startsWith(COMMAND_PREFIX + 'createevent')) {
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
  if (message.content.startsWith(COMMAND_PREFIX + 'eventedit')) {
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
        roles: event.roles || [],
        availableRoles: rolesRes.data,
        currentRoleIndex: 0,
        awaitingField: null,
        timeoutId: null // 🔥 add this
      };      
      

      message.reply(`✏️ Editing Event **${event.title}**.\nEnter a new **title**, or type "skip" to keep existing.`);
    } catch (err) {
      console.error('Error fetching event:', err?.response?.data || err.message);
      message.reply('❌ Failed to fetch event. Make sure the ID is valid.');
    }
    return;
  }

  if (message.content === COMMAND_PREFIX + 'testchannel'){
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
  if (message.content.startsWith(COMMAND_PREFIX + 'fetchmsg')) {
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
  
  if (message.content.startsWith(COMMAND_PREFIX + 'checkchannelaccess')) {
    const channelId = message.content.split(' ')[1];
    try {
      const channel = await client.channels.fetch(String(channelId));
      await message.reply(`✅ Can access: ${channel.name} (${channel.id})`);
    } catch (err) {
      console.error(`❌ Cannot access channel ${channelId}:`, err.message);
      await message.reply(`❌ Cannot access channel ${channelId}.`);
    }
  }

  if (message.content.startsWith(COMMAND_PREFIX + 'updateevent')) {
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
  
     
      const channel = await client.channels.fetch(channelId);
      const msg = await channel.messages.fetch(String(messageId));
  
      const { embeds, components } = buildEventEmbed(fullEvent);
      await msg.edit({ embeds, components });
  
      message.reply(`✅ Event ${eventId} embed updated.`);
    } catch (err) {
      console.error('❌ Update failed:', err?.response?.data || err.message);
      message.reply('❌ Failed to update event embed.');
    }
  }
  if (message.content.startsWith(COMMAND_PREFIX + 'deleteevent')) {
    const args = message.content.split(' ');
    const eventId = parseInt(args[1]);
  
    if (isNaN(eventId)) {
      message.reply('❌ Invalid event ID. Usage: `!deleteevent <eventId>`');
      return;
    }
  
    try {
      // 🧠 FIRST: Fetch event info
      const eventRes = await axios.get(`/api/events/public/${eventId}`, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
      });
  
      const event = eventRes.data;
  
      // 🎯 If Discord message info exists, try deleting the message
      if (event.discordChannelId && event.discordMessageId) {
        try {
          const channel = await client.channels.fetch(event.discordChannelId);
          const msg = await channel.messages.fetch(event.discordMessageId);
  
          await msg.delete();
          console.log(`✅ Deleted Discord message for event ${eventId}`);
        } catch (err) {
          console.warn(`⚠️ Could not delete Discord message for event ${eventId}:`, err.message);
        }
      } else {
        console.warn(`⚠️ No Discord message info found for event ${eventId}`);
      }
  
      // 💥 SECOND: Now delete the event from backend
      await axios.delete(`/api/events/bot/${eventId}`, {
        headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
      });
  
      await message.reply(`🗑️ Successfully deleted event ID: **${eventId}** and removed its Discord message`);
      console.log(`✅ Fully deleted event ${eventId}`);
    } catch (err) {
      console.error('❌ Failed to delete event via command:', err?.response?.data || err.message);
      await message.reply(`❌ Failed to delete event. ${err?.response?.data || 'Unknown error.'}`);
    }
  
    return;
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

  console.log(`🌐 [Webhook] RSVP update received for eventId=${eventId}, channelId=${channelId}, messageId=${messageId}`);

  if (!eventId || !channelId || !messageId) {
    console.warn('❌ Missing data in RSVP update webhook');
    return res.status(400).send('Missing data');
  }

  try {
    const updatedRes = await axios.get(`/api/events/public/${eventId}`, {
      headers: { Authorization: `Bearer ${BOT_API_TOKEN}` }
    });

    const updatedEvent = updatedRes.data;

    console.log(`📦 [Webhook] Event fetched from API:`, updatedEvent.title);

    const channel = await client.channels.fetch(channelId).catch((e) => {
      console.error(`❌ [Webhook] Failed to fetch channel ${channelId}:`, e.message || e);
      throw e;
    });

    const message = await channel.messages.fetch(messageId).catch((e) => {
      console.error(`❌ [Webhook] Failed to fetch message ${messageId}:`, e.message || e);
      throw e;
    });

    const { embeds, components } = buildEventEmbed(updatedEvent);

    await message.edit({ embeds, components });

    console.log(`✅ [Webhook] Event ${eventId} embed updated via webhook`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ [Webhook] Failed to update message from webhook:', err.message || err);
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

    try {
      await sendCustomEventEmbed(channel, event);
      console.log(`✅ Posted full event "${event.title}" to Discord`);
    } catch (embedErr) {
      console.error('⚠️ Failed to send full event embed:', embedErr.message || embedErr);

      // 🔒 Extra fallback isolation
      try {
        await channel.send(`📅 New event created: **${event.title}**\nhttps://tfic-org-website-production.up.railway.app/events/${event.id}`);
        console.log(`🛟 Sent fallback message for event ${event.title}`);
      } catch (fallbackErr) {
        console.error(`❌ Fallback message also failed:`, fallbackErr.message || fallbackErr);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Fully failed to post event to Discord:', err?.message || err);
    res.status(500).send("Failed");
  }
});

// Webhook: Update existing event
app.post('/event-update', async (req, res) => {
  const { eventId, channelId, messageId } = req.body;

  console.log(`🌐 [Webhook] Event update received for eventId=${eventId}`);

  if (!eventId || !channelId || !messageId) {
    console.warn('❌ Missing data in event-update webhook');
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

    console.log(`✅ [Webhook] Event ${eventId} embed updated on Discord`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ [Webhook] Failed to update event via webhook:', err?.message || err);
    res.status(500).send('Failed to update event message');
  }
});


// Webhook to delete event message
app.post('/event-delete', async (req, res) => {
  const { channelId, messageId } = req.body;
  
  if (!channelId || !messageId) {
    console.warn('❌ Missing channelId or messageId in event-delete webhook');
    return res.status(400).send('Missing data');
  }

  try {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    
    await message.delete();

    console.log(`✅ Deleted Discord message ${messageId} from channel ${channelId}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Failed to delete Discord message via webhook:', err.message || err);
    res.status(500).send('Failed to delete message');
  }
});

// Start the webhook server
app.listen(3045, () => {
  console.log('📡 Bot webhook server running on port 3045');
});

client.login(process.env.DISCORD_TOKEN);

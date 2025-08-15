require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const axios = require("axios");

// Bot tokeni
const token = process.env.BOT_TOKEN;
if (!token || token === "YOUR_BOT_TOKEN_HERE") {
  console.error(
    "Ýalňyşlyk: Bot tokeni berilmedi ýa-da nädogry. .env faýlynda BOT_TOKEN üýtgeşýänini düzüň."
  );
  process.exit(1);
}

// RapidAPI key
const rapidApiKey = process.env.RAPIDAPI_KEY;
if (!rapidApiKey) {
  console.error(
    "Ýalňyşlyk: RapidAPI key berilmedi. .env faýlynda RAPIDAPI_KEY üýtgeşýänini düzüň."
  );
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// JSON maglumat bazasy
let db = {
  channels: ["@cobra_servers", "@turkmen_shadowsocks"],
  folderChannels: ["@shadow_community_servers"],
  folderInviteLink: "https://t.me/addlist/IYQiFKJc9cQwMGZi",
  currentVpnCode: "",
  admins: [6179312865], // Öz admin ID-ňizi goşuň
  users: [],
  vpnDistributedCount: 0,
  postedMessageIds: {},
};

// Loglama funksiýalary
const logInfo = (message) => {
  console.log(
    `${new Date().toLocaleString("en-US", {
      timeZone: "Asia/Seoul",
    })} - ${message}`
  );
};

const logError = (message, error) => {
  console.error(`${message}: ${error.message}\nStack: ${error.stack}`);
};

// JSON bilen işlemek üçin funksiýalar
const saveDB = () => {
  try {
    fs.writeFileSync("db.json", JSON.stringify(db, null, 2));
    logInfo("db.json ýazuw üstünlikli ýerine ýetirildi.");
  } catch (error) {
    logError("db.json ýazuwda ýalňyşlyk", error);
    throw new Error("Maglumat bazasyny ýazmak başarmady.");
  }
};

const loadDB = () => {
  try {
    if (fs.existsSync("db.json")) {
      const data = JSON.parse(fs.readFileSync("db.json"));
      if (
        !data.channels ||
        !data.folderChannels ||
        !data.admins ||
        !data.users
      ) {
        throw new Error("db.json faýlynda nädogry format.");
      }
      logInfo("db.json ýüklenildi.");
      return data;
    } else {
      logInfo("db.json faýly ýok, täze faýl döredilýär.");
      saveDB();
      return db;
    }
  } catch (error) {
    logError("db.json ýüklemede ýalňyşlyk", error);
    return db;
  }
};

// Maglumat bazasyny ýüklemek
db = loadDB();

// Telegram API çäklendirmelerini dolandyrmak
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const apiRequestWithRetry = async (fn, retries = 5, delayMs = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 429 || error.message.includes("404 Not Found")) {
        logInfo(
          `API ýalňyşlygy (${error.code || "404"}): ${
            i + 1
          }-nji synanyşyk, garaşma: ${delayMs}ms`
        );
        await delay(delayMs);
        delayMs *= 2;
      } else {
        throw error;
      }
    }
  }
  throw new Error("API çäklendirmesi: Synanyşyklar gutardy.");
};

// TikTok wideosyny ýüklemek funksiýasy
async function downloadTikTokVideo(url, chatId) {
  try {
    // Validate URL
    if (!url.includes("tiktok.com")) {
      await bot.sendMessage(
        chatId,
        "Nädip TikTok ssylkasy. Dogry ssylka ýollan (mysal: https://www.tiktok.com/@username/video/123456789) we täzeden synanş."
      );
      return false;
    }

    await bot.sendMessage(chatId, "Wideo ýüklenýär, garaşyň...");
    await delay(1000); // Prevent RapidAPI rate limits

    // RapidAPI TikTok Downloader
    const response = await axios.get(
      `https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/vid/index?url=${encodeURIComponent(
        url
      )}`,
      {
        headers: {
          "X-RapidAPI-Key": rapidApiKey,
          "X-RapidAPI-Host":
            "tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com",
        },
      }
    );
    logInfo(`RapidAPI response: ${JSON.stringify(response.data, null, 2)}`);

    if (response.data && response.data.video && response.data.video[0]) {
      const videoUrl = response.data.video[0];
      await bot.sendVideo(chatId, videoUrl, {
        caption: "Suwsyz TikTok wideosy!",
      });
      logInfo(`TikTok wideo üstünlikli ugradyldy: ${chatId}`);
      return true;
    } else {
      throw new Error("RapidAPI: Wideonyň ssylkasy gelmedi.");
    }
  } catch (error) {
    logError(`TikTok wideosyny ýüklemekde ýalňyşlyk ${url}`, error);
    let errorMessage = "TikTok wideosyny ýüklemekde ýalňyşlyk ýüze çykdy.";
    if (error.response) {
      if (error.response.status === 429) {
        errorMessage = "API çäklendirmesi: Köp synanyşyk. Soňra synanyşyň.";
      } else if (error.response.status === 403) {
        errorMessage = "Video ýa-da API çäklendirilen. Başga ssylka synanşyň.";
      } else {
        errorMessage = `API ýalňyşlygy: ${error.response.status}. Dogry we umumy TikTok ssylkasy ýollan ýa-da soňra synanş.`;
      }
    } else if (error.message.includes("Network Error")) {
      errorMessage = "Internet birikmesinde ýalňyşlyk. Birikmäňizi barlaň.";
    }
    await bot.sendMessage(chatId, errorMessage);
    return false;
  }
}

// Admin statusyny barlamak
const isAdmin = (userId) => {
  const adminStatus = db.admins.includes(userId);
  if (!adminStatus) {
    logInfo(
      `Admin bolmadyk ulanyjy ${userId} admin paneline girmäge synanyşdy.`
    );
  }
  return adminStatus;
};

// Ulanyjynyň agzalygy barlamak
async function checkMembership(chatId) {
  const requiredChannels = [...db.channels, ...db.folderChannels];
  const notMemberChannels = [];

  for (const channel of requiredChannels) {
    try {
      if (!channel.startsWith("@")) {
        logInfo(`Nädip kanal: ${channel}`);
        notMemberChannels.push(channel);
        continue;
      }
      const chat = await apiRequestWithRetry(() => bot.getChat(channel));
      const status = await apiRequestWithRetry(() =>
        bot.getChatMember(chat.id, chatId)
      );
      if (status.status === "left" || status.status === "kicked") {
        notMemberChannels.push(channel);
      }
      await delay(500);
    } catch (error) {
      logError(`Kanalda ${channel} üçin ${chatId} barlamada ýalňyşlyk`, error);
      notMemberChannels.push(channel);
    }
  }

  return { isMember: notMemberChannels.length === 0, notMemberChannels };
}

// Kanallary we papkany görkezmek
function showChannels(chatId, notMemberChannels = []) {
  const nonFolderChannels = notMemberChannels.filter((c) =>
    db.channels.includes(c)
  );
  const folderNotMemberChannels = notMemberChannels.filter((c) =>
    db.folderChannels.includes(c)
  );

  let message = "VPN kody almak üçin aşakdaky kanallara agza boluň:\n";
  if (notMemberChannels.length > 0) {
    message =
      "Siz aşakdaky kanallara doly agza bolmadyňyz. Kanallara agza boluň we täzeden synanşyň:\n";
    if (nonFolderChannels.length > 0) {
      message +=
        "\nKanallar:\n" + nonFolderChannels.map((c) => `${c}`).join("\n");
    }
    if (folderNotMemberChannels.length > 0) {
      message +=
        "\nAddlist'daky Kanallar:\n" +
        folderNotMemberChannels.map((c) => `${c}`).join("\n");
    }
  }

  const keyboard = {
    inline_keyboard: [
      ...(nonFolderChannels.length > 0
        ? nonFolderChannels.map((channel) => [
            { text: `📢 Kanal`, url: `https://t.me/${channel.slice(1)}` },
          ])
        : db.channels.map((channel) => [
            { text: `📢 Kanal`, url: `https://t.me/${channel.slice(1)}` },
          ])),
      [{ text: `📢 Premium Folder`, url: db.folderInviteLink }],
      [{ text: `✅ Agza Boldum`, callback_data: "check_membership" }],
    ],
  };

  bot
    .sendMessage(chatId, message, { reply_markup: keyboard })
    .catch((error) => {
      logError(`Habary ugradyp bolmadi ${chatId}`, error);
    });
}

// Botuň öz çakylyk baglanyşygyny goşulan kanallara post etmek
async function postBotInviteToAdminChannels() {
  const allChannels = [...db.channels, ...db.folderChannels];
  let successCount = 0;
  let failCount = 0;
  let botUsername;

  try {
    const botInfo = await apiRequestWithRetry(() => bot.getMe());
    botUsername = botInfo.username;
    logInfo(`Bot username: ${botUsername}, Bot ID: ${botInfo.id}`);
  } catch (error) {
    logError("Bot username alynmady", error);
    return { successCount: 0, failCount: 0 };
  }

  // Check if sponsor_bot.png exists
  const imagePath = "./img/sponsor_bot.png";
  const imageExists = fs.existsSync(imagePath);

  for (const channel of allChannels) {
    try {
      if (!channel.startsWith("@")) {
        logInfo(`Nädip kanal: ${channel}`);
        failCount++;
        continue;
      }
      const chat = await apiRequestWithRetry(() => bot.getChat(channel));
      const caption =
        "⚡️ 𝘠𝘢𝘳𝘺𝘢𝘯 𝘝𝘗𝘕 𝘎𝘦𝘳𝘦𝘬𝘮𝘪\n\n📅 𝘉𝘖𝘛'𝘢 3 𝘎𝘶𝘯𝘭𝘶𝘬 𝘝𝘗𝘕 𝘒𝘰𝘥 𝘎𝘰𝘺𝘶𝘭𝘥𝘺\n\n📱 𝘎𝘛𝘚 - 𝘛𝘦𝘭𝘦𝘤𝘰𝘮 - 3G - 4G\n\n⚡️ 𝘛𝘪𝘬𝘛𝘰𝘬 | 🔥 𝘠𝘰𝘶𝘛𝘶𝘣𝘦 | ⚡️ 𝘪𝘯𝘴𝘵𝘢𝘨𝘳𝘢𝘮 | 🔥 𝘛𝘦𝘭𝘦𝘨𝘳𝘢𝘮\n\n ✅ 𝘝𝘗𝘕'𝘺𝘯 𝘒𝘦𝘺𝘱𝘪𝘯𝘪 𝘊𝘺𝘬𝘢𝘳𝘺𝘯";
      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: "𝘝𝘗𝘕 𝘈𝘭𝘮𝘢𝘬 ✅",
              url: `https://t.me/${botUsername}?start=from_channel`,
            },
          ],
        ],
      };

      let sentMessage;
      if (imageExists) {
        sentMessage = await apiRequestWithRetry(() =>
          bot.sendPhoto(chat.id, imagePath, {
            caption,
            parse_mode: "HTML",
            reply_markup: replyMarkup,
          })
        );
      } else {
        logInfo(`sponsor_bot.png ýok, tekst habar ugradylýar: ${channel}`);
        sentMessage = await apiRequestWithRetry(() =>
          bot.sendMessage(chat.id, caption, {
            parse_mode: "HTML",
            reply_markup: replyMarkup,
          })
        );
      }

      db.postedMessageIds[chat.id] = db.postedMessageIds[chat.id] || [];
      db.postedMessageIds[chat.id].push(sentMessage.message_id);
      saveDB();
      successCount++;
      logInfo(
        `Post ${channel} kanalyna ugradyldy, Message ID: ${sentMessage.message_id}`
      );
      await delay(1000);
    } catch (error) {
      logError(`Bot çakylyk ugratmakda ýalňyşlyk ${channel}`, error);
      failCount++;
    }
  }

  logInfo(
    `Bot çakylygy ugradyldy: Üstünlikli: ${successCount}, Ýalňyşlyklar: ${failCount}`
  );
  return { successCount, failCount };
}

// Adminiň ýörite habaryny goşulan kanallara ugratmak
async function postChannelMessage(messageText) {
  const allChannels = [...db.channels, ...db.folderChannels];
  let successCount = 0;
  let failCount = 0;

  for (const channel of allChannels) {
    try {
      if (!channel.startsWith("@")) {
        logInfo(`Nädip kanal: ${channel}`);
        failCount++;
        continue;
      }
      const chat = await apiRequestWithRetry(() => bot.getChat(channel));
      const sentMessage = await apiRequestWithRetry(() =>
        bot.sendMessage(chat.id, messageText, { parse_mode: "HTML" })
      );
      db.postedMessageIds[chat.id] = db.postedMessageIds[chat.id] || [];
      db.postedMessageIds[chat.id].push(sentMessage.message_id);
      saveDB();
      successCount++;
      logInfo(
        `Habar ${channel} kanalyna ugradyldy, Message ID: ${sentMessage.message_id}`
      );
      await delay(1000);
    } catch (error) {
      logError(`Habar ugratmakda ýalňyşlyk ${channel}`, error);
      failCount++;
    }
  }

  logInfo(
    `Kanala habar ugradyldy: Üstünlikli: ${successCount}, Ýalňyşlyklar: ${failCount}`
  );
  return { successCount, failCount };
}

// Botuň ugradylan habarlaryny pozmak
async function deletePostedMessages() {
  const allChannels = [...db.channels, ...db.folderChannels];
  let successCount = 0;
  let failCount = 0;

  for (const channel of allChannels) {
    try {
      if (!channel.startsWith("@")) {
        logInfo(`Nädip kanal: ${channel}`);
        failCount++;
        continue;
      }
      const chat = await apiRequestWithRetry(() => bot.getChat(channel));
      const messageIds = db.postedMessageIds[chat.id] || [];
      for (const messageId of messageIds) {
        try {
          await apiRequestWithRetry(() =>
            bot.deleteMessage(chat.id, messageId)
          );
          successCount++;
          logInfo(
            `Ugradylan habarlar pozuldy: ${channel}, Message ID: ${messageId}`
          );
          await delay(500);
        } catch (error) {
          logError(
            `Habar pozmakda ýalňyşlyk ${channel}, Message ID: ${messageId}`,
            error
          );
          failCount++;
        }
      }
      db.postedMessageIds[chat.id] = [];
      saveDB();
    } catch (error) {
      logError(`Kanaly barlamada ýalňyşlyk ${channel}`, error);
      failCount++;
    }
  }

  logInfo(
    `Pozulmali Habarlar: Üstünlikli: ${successCount}, Ýalňyşlyklar: ${failCount}`
  );
  return { successCount, failCount };
}

// /start komandasy
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    if (!db.users.includes(chatId)) {
      db.users.push(chatId);
      saveDB();
      logInfo(`Täze ulanyjy goşuldy: ${chatId}`);
    }
    const userKeyboard = {
      inline_keyboard: [
        [{ text: "🔒 Mugt VPN almak", callback_data: "check_membership" }],
        [
          {
            text: "📹 TikTok Video Ýüklemek",
            callback_data: "download_tiktok",
          },
        ],
        [{ text: "💎 Premium Hyzmatlar", callback_data: "premium_services" }],
        [
          { text: "💻 Dev info", callback_data: "dev_info" },
          { text: "📊 Statistika", callback_data: "statistika" },
        ],
        ...(isAdmin(msg.from.id)
          ? [[{ text: "⚙️ Admin paneli", callback_data: "admin_panel" }]]
          : []),
      ],
    };
    await bot.sendMessage(chatId, "User paneline hoş geldiňiz!", {
      reply_markup: userKeyboard,
    });
  } catch (error) {
    logError("/start komandasynda ýalňyşlyk", error);
    await bot
      .sendMessage(chatId, "Ýalňyşlyk ýüze çykdy. Soňra synanyşyň.")
      .catch((err) => {
        logError("Ýalňyşlyk habary ugratmakda ýalňyşlyk", err);
      });
  }
});

// /admin komandasy
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    if (isAdmin(msg.from.id)) {
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "⚙️ Normal Admin Panel",
              callback_data: "normal_admin_panel",
            },
          ],
          [
            {
              text: "🔧 Advanced Admin Panel",
              callback_data: "advanced_admin_panel",
            },
          ],
        ],
      };
      await bot.sendMessage(chatId, "⚙️ Admin paneline hoş geldiňiz!", {
        reply_markup: keyboard,
      });
    } else {
      await bot.sendMessage(chatId, "Siz administrator däl.");
    }
  } catch (error) {
    logError("/admin komandasynda ýalňyşlyk", error);
    await bot.sendMessage(chatId, "Ýalňyşlyk ýüze çykdy.").catch((err) => {
      logError("Ýalňyşlyk habary ugratmakda ýalňyşlyk", err);
    });
  }
});

// Callback soraglary
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;

  try {
    if (data === "check_membership") {
      const { isMember, notMemberChannels } = await checkMembership(chatId);
      if (isMember) {
        if (db.currentVpnCode) {
          await bot.sendMessage(
            chatId,
            `🔒 VPN kody: \n\n<code>${db.currentVpnCode}</code>`,
            {
              parse_mode: "HTML",
            }
          );
          db.vpnDistributedCount++;
          saveDB();
          logInfo(`VPN kody ugradyldy: ${chatId}`);
        } else {
          await bot.sendMessage(chatId, "Häzirki wagtda VPN kody ýok.");
        }
      } else {
        showChannels(chatId, notMemberChannels);
      }
    }

    if (data === "download_tiktok") {
      const { isMember, notMemberChannels } = await checkMembership(chatId);
      if (isMember) {
        await bot.sendMessage(chatId, "TikTok wideosynyň ssylkasyny ýollan:");
        bot.once("message", async (msg) => {
          const videoUrl = msg.text;
          await downloadTikTokVideo(videoUrl, chatId);
        });
      } else {
        showChannels(chatId, notMemberChannels);
      }
    }

    const adminKeyboard = {
      inline_keyboard: [
        [{ text: "📞 Admin", url: "https://t.me/batyrovv0991" }],
      ],
    };
    if (data === "premium_services") {
      await bot.sendMessage(
        chatId,
        `💎 Satylýan VPN'lar:\n\n🔒 Happ VPN\n🔒 V2BOX\n🔒 NPV Tunnel\n\n💸 Bahalary:\n\n💸 Aýlyk - 100 TMT\n💸 Hepdelik - 35 TMT\n\n📱 Enjamlar:\n\n📱 IOS/Android/PC\n\n📞 VPN Satyn Almak Üçin Admin'a Ýüz Tutuň`,
        { reply_markup: adminKeyboard }
      );
    }

    if (data === "dev_info") {
      await bot.sendMessage(
        chatId,
        `💻 Dev Info:\n\nName: Ahmed\nContact: @batyrovv0991\nJob: Backend Developer`
      );
    }

    if (data === "statistika") {
      try {
        const userCount = db.users.length;
        const vpnCount = db.vpnDistributedCount;
        const activeChannels = db.channels.length + db.folderChannels.length;
        await bot.sendMessage(
          chatId,
          `📊 Statistika:\n\n` +
            `👤 Jemi Ulanyjylaryň Sany: ${userCount}\n` +
            `🔒 Jemi Paýlanan VPN Sany: ${vpnCount}\n` +
            `📢 Aktiw kanallar: ${activeChannels}`
        );
        logInfo(`Statistika görkezildi: ${chatId}`);
      } catch (error) {
        logError("Statistika görkezmekde ýalňyşlyk", error);
        await bot.sendMessage(
          chatId,
          "Statistikany görkezmekde ýalňyşlyk ýüze çykdy."
        );
      }
    }

    if (data === "admin_panel" && isAdmin(userId)) {
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "⚙️ Normal Admin Panel",
              callback_data: "normal_admin_panel",
            },
          ],
          [
            {
              text: "🔧 Advanced Admin Panel",
              callback_data: "advanced_admin_panel",
            },
          ],
        ],
      };
      await bot.sendMessage(chatId, "⚙️ Admin paneline hoş geldiňiz!", {
        reply_markup: keyboard,
      });
    } else if (data === "admin_panel") {
      await bot.sendMessage(chatId, "Siz administrator däl.");
    }

    if (data === "normal_admin_panel" && isAdmin(userId)) {
      const keyboard = {
        inline_keyboard: [
          [{ text: "🔒 VPN kody çalyşmak", callback_data: "replace_vpn" }],
          [
            { text: "➕ Kanal goşmak", callback_data: "add_channel" },
            { text: "➖ Kanal aýyrmak", callback_data: "remove_channel" },
          ],
          [
            {
              text: "➕ Addlist'a kanal goşmak",
              callback_data: "add_folder_channel",
            },
            {
              text: "➖ Addlist kanalyny aýyrmak",
              callback_data: "remove_folder_channel",
            },
          ],
          [
            {
              text: "🔗 Addlist Invite Link Çalsmak",
              callback_data: "replace_folder_link",
            },
          ],
        ],
      };
      await bot.sendMessage(chatId, "⚙️ Normal Admin Paneli:", {
        reply_markup: keyboard,
      });
    } else if (data === "normal_admin_panel") {
      await bot.sendMessage(chatId, "Siz administrator däl.");
    }

    if (data === "advanced_admin_panel" && isAdmin(userId)) {
      const keyboard = {
        inline_keyboard: [
          [
            { text: "📩 Admin Habary", callback_data: "admin_message" },
            { text: "🌟 VPN reklamasy", callback_data: "admin_ads" },
          ],
          [{ text: "🤖 Bot Post", callback_data: "post_bot_invite" }],
          [{ text: "📢 Channel Message", callback_data: "channel_message" }],
          [{ text: "🗑️ Delete Posts", callback_data: "delete_posts" }],
        ],
      };
      await bot.sendMessage(chatId, "🔧 Advanced Admin Paneli:", {
        reply_markup: keyboard,
      });
    } else if (data === "advanced_admin_panel") {
      await bot.sendMessage(chatId, "Siz administrator däl.");
    }

    if (data === "post_bot_invite" && isAdmin(userId)) {
      const { successCount, failCount } = await postBotInviteToAdminChannels();
      await bot.sendMessage(
        chatId,
        `🤖 Bot çakylyk habary ugradyldy:\nÜstünlikli: ${successCount}\nÝalňyşlyklar: ${failCount}`
      );
    }

    if (data === "channel_message" && isAdmin(userId)) {
      await bot.sendMessage(
        chatId,
        "Kanallara ugratmak üçin ýörite habaryňyzy ýazyň:"
      );
      bot.once("message", async (msg) => {
        const messageText = msg.text;
        const { successCount, failCount } = await postChannelMessage(
          messageText
        );
        await bot.sendMessage(
          chatId,
          `📢 Channel habary ugradyldy:\nÜstünlikli: ${successCount}\nÝalňyşlyklar: ${failCount}`
        );
      });
    }

    if (data === "delete_posts" && isAdmin(userId)) {
      const { successCount, failCount } = await deletePostedMessages();
      await bot.sendMessage(
        chatId,
        `🗑️ Habarlar pozuldy:\nÜstünlikli: ${successCount}\nÝalňyşlyklar: ${failCount}`
      );
    }

    if (data === "replace_vpn" && isAdmin(userId)) {
      await bot.sendMessage(chatId, "Täze VPN kodyny giriziň:");
      bot.once("message", (msg) => {
        db.currentVpnCode = msg.text;
        saveDB();
        bot.sendMessage(chatId, "🔒 VPN kody çalşyldy.").catch((error) => {
          logError("VPN kody çalşylyş habary ugratmakda ýalňyşlyk", error);
        });
      });
    }

    if (data === "add_channel" && isAdmin(userId)) {
      await bot.sendMessage(
        chatId,
        "Kanalyň adyny giriziň (mysal üçin, @ChannelName):"
      );
      bot.once("message", (msg) => {
        const channel = msg.text;
        if (!channel.startsWith("@")) {
          bot
            .sendMessage(chatId, "Kanal ady @ bilan başlamaly.")
            .catch((error) => {
              logError("Kanal goşulýan habar ugratmakda ýalňyşlyk", error);
            });
          return;
        }
        db.channels.push(channel);
        saveDB();
        bot.sendMessage(chatId, "➕ Kanal goşuldy.").catch((error) => {
          logError("Kanal goşuldy habary ugratmakda ýalňyşlyk", error);
        });
      });
    }

    if (data.startsWith("remove_channel_") && isAdmin(userId)) {
      const channel = data.replace("remove_channel_", "");
      if (db.channels.includes(channel)) {
        db.channels = db.channels.filter((c) => c !== channel);
        saveDB();
        await bot.sendMessage(chatId, `➖ ${channel} aýyryldy.`);
      } else {
        await bot.sendMessage(
          chatId,
          `${channel} aýyrylmady, sebäbi maglumat bazasynda ýok.`
        );
      }
    }

    if (data === "add_folder_channel" && isAdmin(userId)) {
      await bot.sendMessage(chatId, "Papka üçin kanalyň adyny giriziň:");
      bot.once("message", (msg) => {
        const channel = msg.text;
        if (!channel.startsWith("@")) {
          bot
            .sendMessage(chatId, "Kanal ady @ bilan başlamaly.")
            .catch((error) => {
              logError(
                "Papka kanaly goşulýan habar ugratmakda ýalňyşlyk",
                error
              );
            });
          return;
        }
        db.folderChannels.push(channel);
        saveDB();
        bot.sendMessage(chatId, "➕ Addlist kanaly goşuldy.").catch((error) => {
          logError("Papka kanaly goşuldy habary ugratmakda ýalňyşlyk", error);
        });
      });
    }

    if (data.startsWith("remove_folder_channel_") && isAdmin(userId)) {
      const channel = data.replace("remove_folder_channel_", "");
      if (db.folderChannels.includes(channel)) {
        db.folderChannels = db.folderChannels.filter((c) => c !== channel);
        saveDB();
        await bot.sendMessage(chatId, `➖ ${channel} addlist'dan aýyryldy.`);
      } else {
        await bot.sendMessage(
          chatId,
          `${channel} aýyrylmady, sebäbi maglumat bazasynda ýok.`
        );
      }
    }

    if (data === "replace_folder_link" && isAdmin(userId)) {
      await bot.sendMessage(
        chatId,
        "Täze papka çakylyk baglanyşygyny giriziň:"
      );
      bot.once("message", (msg) => {
        db.folderInviteLink = msg.text;
        saveDB();
        bot
          .sendMessage(chatId, "🔗 Papka çakylyk baglanyşygy çalşyldy.")
          .catch((error) => {
            logError("Papka linki çalşylyş habary ugratmakda ýalňyşlyk", error);
          });
      });
    }

    if (data === "admin_message" && isAdmin(userId)) {
      await bot.sendMessage(chatId, "Admin habaryny giriziň:");
      bot.once("message", async (msg) => {
        const messageText = msg.text;
        let successCount = 0;
        let failCount = 0;

        for (const userId of db.users) {
          try {
            await apiRequestWithRetry(() =>
              bot.sendMessage(userId, `📩 ${messageText}`)
            );
            successCount++;
            await delay(50);
          } catch (error) {
            logError(`Admin habary ugratmakda ýalňyşlyk ${userId}`, error);
            failCount++;
          }
        }

        await bot.sendMessage(
          chatId,
          `📩 Admin habary ähli ulanyjylara ugradyldy:\nÜstünlikli: ${successCount}\nÝalňyşlyklar: ${failCount}`
        );
      });
    }

    if (data === "admin_ads" && isAdmin(userId)) {
      await bot.sendMessage(chatId, "VPN reklamasyny giriziň:");
      bot.once("message", async (msg) => {
        const adText = msg.text;
        let successCount = 0;
        let failCount = 0;

        for (const userId of db.users) {
          try {
            await apiRequestWithRetry(() =>
              bot.sendMessage(userId, `🌟 VPN reklamasy\n${adText}`)
            );
            successCount++;
            await delay(50);
          } catch (error) {
            logError(`Reklama ugratmakda ýalňyşlyk ${userId}`, error);
            failCount++;
          }
        }

        await bot.sendMessage(
          chatId,
          `🌟 Reklama ähli ulanyjylara ugradyldy:\nÜstünlikli: ${successCount}\nÝalňyşlyklar: ${failCount}`
        );
      });
    }

    if (data === "remove_channel" && isAdmin(userId)) {
      if (db.channels.length === 0) {
        await bot.sendMessage(chatId, "Aýyrmak üçin kanal ýok.");
        return;
      }
      const keyboard = {
        inline_keyboard: db.channels.map((channel) => [
          { text: `➖ ${channel}`, callback_data: `remove_channel_${channel}` },
        ]),
      };
      await bot.sendMessage(chatId, "Haýsy kanaly aýyrmakçy:", {
        reply_markup: keyboard,
      });
    }

    if (data === "remove_folder_channel" && isAdmin(userId)) {
      if (db.folderChannels.length === 0) {
        await bot.sendMessage(chatId, "Addlist'da aýyrmak üçin kanal ýok.");
        return;
      }
      const keyboard = {
        inline_keyboard: db.folderChannels.map((channel) => [
          {
            text: `➖ ${channel}`,
            callback_data: `remove_folder_channel_${channel}`,
          },
        ]),
      };
      await bot.sendMessage(chatId, "Addlist'dan haýsy kanaly aýyrmakçy:", {
        reply_markup: keyboard,
      });
    }
  } catch (error) {
    logError("Callback soragynda ýalňyşlyk", error);
    await bot
      .sendMessage(chatId, "Ýalňyşlyk ýüze çykdy. Soňra synanyşyň.")
      .catch((err) => {
        logError("Ýalňyşlyk habary ugratmakda ýalňyşlyk", err);
      });
  }
});

// Polling ýalňyşlyklary
bot.on("polling_error", (error) => {
  logError("Polling ýalňyşlygy", error);
  if (error.message.includes("404 Not Found")) {
    console.error(
      "Ýalňyş bot tokeni ýa-da Telegram API-a ýetip bolmady. .env faýlynda BOT_TOKEN barlaň ýa-da internet birikmesini barlaň."
    );
  }
});

// Botyň işledigini barlamak
bot
  .getMe()
  .then((botInfo) => {
    logInfo(`Bot işledi: @${botInfo.username} (ID: ${botInfo.id})`);
  })
  .catch((error) => {
    logError("Bot barlamasynda ýalňyşlyk", error);
    if (error.message.includes("404 Not Found")) {
      console.error("Nädip bot tokeni. @BotFather bilen täze token alyň.");
      process.exit(1);
    }
  });

logInfo("Bot işledilýär...");

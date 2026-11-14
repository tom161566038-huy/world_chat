/**
 * 界面文案（阶段 8）：所有界面铬按用户语言渲染，支持 zh/en/ja/es/fr。
 * 服务端 error 事件带 code，客户端按 code 映射本地化文案（i18nServerCode），
 * 不直接展示服务端的中文 message。
 * 房间标题/话题也在这里本地化，找不到时退回 src/shared/rooms.ts 的中文原文。
 */
import type { LanguageCode } from "../shared/types"

export const LANGUAGES: Array<{ code: LanguageCode; label: string; htmlLang: string }> = [
  { code: "zh", label: "中文", htmlLang: "zh-CN" },
  { code: "en", label: "English", htmlLang: "en" },
  { code: "ja", label: "日本語", htmlLang: "ja" },
  { code: "es", label: "Español", htmlLang: "es" },
  { code: "fr", label: "Français", htmlLang: "fr" },
]

export function htmlLangOf(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.htmlLang ?? "zh-CN"
}

/** 首次访问时按浏览器语言猜界面语言（zh/en/ja/es/fr），猜不中默认中文。 */
export function detectLanguage(): LanguageCode {
  const codes = LANGUAGES.map((l) => l.code)
  for (const pref of navigator.languages ?? [navigator.language]) {
    const base = pref.toLowerCase().split("-")[0] ?? ""
    if (codes.includes(base)) return base
  }
  return "zh"
}

/** 同语言不翻译，与服务端 sameLanguage 的语义保持一致。 */
export function sameLanguage(a: LanguageCode, b: LanguageCode): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** 文档页（隐私/条款）的小节结构。 */
export interface DocSection {
  h: string
  p: string[]
}

interface Strings {
  // 落地页 / 入口
  tagline: string
  landingIntro: string
  howTitle: string
  how1: string
  how2: string
  how3: string
  nameLabel: string
  namePlaceholder: string
  langLabel: string
  continueBtn: string
  enterRoomNote: string // {room}
  // 房间列表
  helloRooms: string // {name}
  roomsHeading: string
  changeIdentity: string
  copyLink: string
  copied: string
  // 房间不存在
  notFoundTitle: string
  notFoundBody: string // {room}
  backToRooms: string
  // 页脚
  privacyLink: string
  termsLink: string
  // 聊天
  leave: string
  connected: string
  connecting: string
  reconnecting: string
  offlineBanner: string
  joiningRoom: string
  emptyRoom: string
  inputPlaceholder: string
  sendBtn: string
  showOriginal: string
  hideOriginal: string
  translating: string
  translationFailed: string
  inviteBtn: string
  inviteCopied: string
  report: string
  reportPlaceholder: string
  submitting: string
  submitBtn: string
  cancel: string
  reportDone: string
  reportFailed: string
  // 服务端错误码 → 本地化文案
  errBadJson: string
  errNotJoined: string
  errTooLong: string
  errFiltered: string
  errRateLimited: string
  errBadReport: string
  errFallback: string
  // 房间名 / 话题（按 slug）
  roomLobbyTitle: string
  roomLobbyTopic: string
  roomTravelTitle: string
  roomTravelTopic: string
  roomFoodTitle: string
  roomFoodTopic: string
  roomLanguageTitle: string
  roomLanguageTopic: string
}

const STRINGS: Record<string, Strings> = {
  zh: {
    tagline: "用自己的语言聊天，看到大家的语言。",
    landingIntro:
      "WorldChat 是一个免费的跨语言聊天室：你用自己的语言打字，其他人自动看到译成他们语言的文本，每条消息都能查看原文。无需注册，手机上可添加到主屏当 App 用。",
    howTitle: "怎么用",
    how1: "选好你的语言，起个显示名称。",
    how2: "进入一个话题房间，或打开朋友分享给你的房间链接。",
    how3: "用自己的语言打字。大家看到的是他们自己的语言，点「查看原文」随时能看到你的原话。",
    nameLabel: "显示名称",
    namePlaceholder: "给自己起个名字",
    langLabel: "我的语言",
    continueBtn: "继续",
    enterRoomNote: "填好后将进入房间「{room}」。",
    helloRooms: "你好，{name}！挑个房间开聊吧。",
    roomsHeading: "房间",
    changeIdentity: "换个身份",
    copyLink: "复制链接",
    copied: "已复制",
    notFoundTitle: "找不到这个房间",
    notFoundBody: "房间「{room}」不存在，可能链接有误。",
    backToRooms: "回到房间列表",
    privacyLink: "隐私说明",
    termsLink: "服务条款",
    leave: "← 离开",
    connected: "已连接",
    connecting: "连接中…",
    reconnecting: "重连中…",
    offlineBanner: "连接已断开，正在重新连接…此期间消息发不出去。",
    joiningRoom: "正在进入房间…",
    emptyRoom: "还没有消息，打个招呼吧~",
    inputPlaceholder: "输入消息…",
    sendBtn: "发送",
    showOriginal: "查看原文",
    hideOriginal: "收起原文",
    translating: "翻译中…",
    translationFailed: "翻译暂时不可用，可点此查看原文",
    inviteBtn: "邀请",
    inviteCopied: "邀请链接已复制",
    report: "举报",
    reportPlaceholder: "举报理由（选填）",
    submitting: "提交中…",
    submitBtn: "提交",
    cancel: "取消",
    reportDone: "已收到举报，感谢反馈",
    reportFailed: "提交失败，请稍后重试",
    errBadJson: "消息格式错误",
    errNotJoined: "请先加入房间",
    errTooLong: "消息太长了，请删减后再发",
    errFiltered: "消息被过滤，请修改后再发",
    errRateLimited: "发得太快啦，歇一歇再发",
    errBadReport: "举报提交失败，请稍后重试",
    errFallback: "出错了，请稍后重试",
    roomLobbyTitle: "大厅",
    roomLobbyTopic: "自由聊天，认识来自世界的朋友",
    roomTravelTitle: "旅行",
    roomTravelTopic: "分享目的地、攻略和路上的故事",
    roomFoodTitle: "美食",
    roomFoodTopic: "聊聊各地好吃的和家常菜",
    roomLanguageTitle: "语言交换",
    roomLanguageTopic: "互相教学，练口语练写作",
  },
  en: {
    tagline: "Chat in your language — everyone reads in theirs.",
    landingIntro:
      "WorldChat is a free multilingual chat room. Type in your own language and others automatically see your message translated into theirs — with the original always one tap away. No sign-up, and it installs to your phone's home screen.",
    howTitle: "How it works",
    how1: "Pick your language and a display name.",
    how2: "Join a topic room, or open a room link a friend shared with you.",
    how3: "Type in your own language. Everyone reads in theirs, and “Show original” reveals exactly what you wrote.",
    nameLabel: "Display name",
    namePlaceholder: "Pick a name for yourself",
    langLabel: "My language",
    continueBtn: "Continue",
    enterRoomNote: "You'll join “{room}” after this.",
    helloRooms: "Hi, {name}! Pick a room and start chatting.",
    roomsHeading: "Rooms",
    changeIdentity: "Change identity",
    copyLink: "Copy link",
    copied: "Copied",
    notFoundTitle: "Room not found",
    notFoundBody: "The room “{room}” doesn't exist — the link may be wrong.",
    backToRooms: "Back to rooms",
    privacyLink: "Privacy",
    termsLink: "Terms",
    leave: "← Leave",
    connected: "Connected",
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
    offlineBanner: "Connection lost, reconnecting… You can't send messages right now.",
    joiningRoom: "Entering the room…",
    emptyRoom: "No messages yet — say hi!",
    inputPlaceholder: "Type a message…",
    sendBtn: "Send",
    showOriginal: "Show original",
    hideOriginal: "Hide original",
    translating: "Translating…",
    translationFailed: "Translation unavailable — tap to view the original",
    inviteBtn: "Invite",
    inviteCopied: "Invite link copied",
    report: "Report",
    reportPlaceholder: "Reason (optional)",
    submitting: "Submitting…",
    submitBtn: "Submit",
    cancel: "Cancel",
    reportDone: "Report received — thank you",
    reportFailed: "Failed to submit, please try again",
    errBadJson: "Malformed message",
    errNotJoined: "Join the room first",
    errTooLong: "Message too long, please shorten it",
    errFiltered: "Message blocked by the filter, please rephrase",
    errRateLimited: "You're sending too fast — take a short break",
    errBadReport: "Could not submit the report, please try again",
    errFallback: "Something went wrong, please retry",
    roomLobbyTitle: "Lobby",
    roomLobbyTopic: "Free chat — meet people from around the world",
    roomTravelTitle: "Travel",
    roomTravelTopic: "Destinations, tips and stories from the road",
    roomFoodTitle: "Food",
    roomFoodTopic: "Local dishes, street food and home cooking",
    roomLanguageTitle: "Language Exchange",
    roomLanguageTopic: "Teach each other — practice speaking and writing",
  },
  ja: {
    tagline: "自分の言語で話そう。みんなには自分の言語で見える。",
    landingIntro:
      "WorldChat は無料の多言語チャットルームです。自分の言語で入力すると、他の人には自動的にその言語に翻訳されて表示され、原文もいつでもワンタップで確認できます。登録不要で、スマホのホーム画面にアプリとして追加できます。",
    howTitle: "使い方",
    how1: "言語と表示名を選びます。",
    how2: "トピックの部屋に入るか、友達から共有された部屋のリンクを開きます。",
    how3: "自分の言語で入力しましょう。相手には相手の言語で表示され、「原文を見る」であなたの書いたままの文章を確認できます。",
    nameLabel: "表示名",
    namePlaceholder: "名前を決めましょう",
    langLabel: "自分の言語",
    continueBtn: "続ける",
    enterRoomNote: "入力すると「{room}」の部屋に入ります。",
    helloRooms: "こんにちは、{name}さん！部屋を選んでチャットを始めましょう。",
    roomsHeading: "部屋",
    changeIdentity: "表示名を変える",
    copyLink: "リンクをコピー",
    copied: "コピーしました",
    notFoundTitle: "部屋が見つかりません",
    notFoundBody: "「{room}」という部屋は存在しません。リンクが間違っているかもしれません。",
    backToRooms: "部屋の一覧に戻る",
    privacyLink: "プライバシー",
    termsLink: "利用規約",
    leave: "← 退出",
    connected: "接続中",
    connecting: "接続しています…",
    reconnecting: "再接続しています…",
    offlineBanner: "接続が切れました。再接続中…この間はメッセージを送れません。",
    joiningRoom: "部屋に入っています…",
    emptyRoom: "まだメッセージがありません。挨拶してみましょう！",
    inputPlaceholder: "メッセージを入力…",
    sendBtn: "送信",
    showOriginal: "原文を見る",
    hideOriginal: "原文を閉じる",
    translating: "翻訳中…",
    translationFailed: "翻訳できません。タップで原文を確認",
    inviteBtn: "招待",
    inviteCopied: "招待リンクをコピーしました",
    report: "通報",
    reportPlaceholder: "理由（任意）",
    submitting: "送信中…",
    submitBtn: "送信",
    cancel: "キャンセル",
    reportDone: "通報を受け付けました。ありがとうございます",
    reportFailed: "送信できませんでした。もう一度お試しください",
    errBadJson: "メッセージの形式が正しくありません",
    errNotJoined: "先に部屋に入ってください",
    errTooLong: "メッセージが長すぎます。短くしてください",
    errFiltered: "メッセージがフィルターでブロックされました。書き直してください",
    errRateLimited: "送信が速すぎます。少し待ってください",
    errBadReport: "通報を送信できませんでした。もう一度お試しください",
    errFallback: "エラーが発生しました。もう一度お試しください",
    roomLobbyTitle: "ロビー",
    roomLobbyTopic: "自由におしゃべり。世界中の人と知り合おう",
    roomTravelTitle: "旅行",
    roomTravelTopic: "旅行先やおすすめ、道中の物語を共有しよう",
    roomFoodTitle: "グルメ",
    roomFoodTopic: "ご当地グルメや家庭料理の話題",
    roomLanguageTitle: "ランゲージエクスチェンジ",
    roomLanguageTopic: "教え合って、話す・書くを練習しよう",
  },
  es: {
    tagline: "Chatea en tu idioma: cada quien lee en el suyo.",
    landingIntro:
      "WorldChat es una sala de chat multilingüe y gratuita. Escribe en tu idioma y los demás ven automáticamente tu mensaje traducido al suyo, con el original siempre a un toque de distancia. Sin registro, y puedes instalarlo en la pantalla de inicio de tu móvil.",
    howTitle: "Cómo funciona",
    how1: "Elige tu idioma y un nombre para mostrar.",
    how2: "Entra en una sala por tema, o abre el enlace que te compartió alguien.",
    how3: "Escribe en tu idioma. Cada quien lee en el suyo, y con «Ver original» puedes comprobar el texto exacto.",
    nameLabel: "Nombre para mostrar",
    namePlaceholder: "Elige un nombre",
    langLabel: "Mi idioma",
    continueBtn: "Continuar",
    enterRoomNote: "Después de esto entrarás en «{room}».",
    helloRooms: "¡Hola, {name}! Elige una sala y empieza a chatear.",
    roomsHeading: "Salas",
    changeIdentity: "Cambiar identidad",
    copyLink: "Copiar enlace",
    copied: "Copiado",
    notFoundTitle: "Sala no encontrada",
    notFoundBody: "La sala «{room}» no existe; puede que el enlace esté mal.",
    backToRooms: "Volver a las salas",
    privacyLink: "Privacidad",
    termsLink: "Términos",
    leave: "← Salir",
    connected: "Conectado",
    connecting: "Conectando…",
    reconnecting: "Reconectando…",
    offlineBanner: "Se perdió la conexión, reconectando… No puedes enviar mensajes por ahora.",
    joiningRoom: "Entrando en la sala…",
    emptyRoom: "Aún no hay mensajes. ¡Saluda!",
    inputPlaceholder: "Escribe un mensaje…",
    sendBtn: "Enviar",
    showOriginal: "Ver original",
    hideOriginal: "Ocultar original",
    translating: "Traduciendo…",
    translationFailed: "Traducción no disponible; toca para ver el original",
    inviteBtn: "Invitar",
    inviteCopied: "Enlace de invitación copiado",
    report: "Denunciar",
    reportPlaceholder: "Motivo (opcional)",
    submitting: "Enviando…",
    submitBtn: "Enviar",
    cancel: "Cancelar",
    reportDone: "Denuncia recibida, gracias",
    reportFailed: "No se pudo enviar, inténtalo de nuevo",
    errBadJson: "Mensaje con formato incorrecto",
    errNotJoined: "Únete a la sala primero",
    errTooLong: "El mensaje es demasiado largo, acórtalo",
    errFiltered: "El mensaje fue bloqueado por el filtro; reformúlalo",
    errRateLimited: "Estás enviando demasiado rápido; espera un momento",
    errBadReport: "No se pudo enviar la denuncia, inténtalo de nuevo",
    errFallback: "Algo salió mal, inténtalo de nuevo",
    roomLobbyTitle: "Vestíbulo",
    roomLobbyTopic: "Charla libre: conoce gente de todo el mundo",
    roomTravelTitle: "Viajes",
    roomTravelTopic: "Destinos, consejos e historias del camino",
    roomFoodTitle: "Comida",
    roomFoodTopic: "Platos locales, comida callejera y cocina casera",
    roomLanguageTitle: "Intercambio de idiomas",
    roomLanguageTopic: "Enseña y aprende: practica hablar y escribir",
  },
  fr: {
    tagline: "Discutez dans votre langue — chacun lit dans la sienne.",
    landingIntro:
      "WorldChat est un salon de discussion multilingue gratuit. Écrivez dans votre langue et les autres voient automatiquement votre message traduit dans la leur, l'original restant toujours à un geste. Sans inscription, et installable sur l'écran d'accueil du téléphone.",
    howTitle: "Comment ça marche",
    how1: "Choisissez votre langue et un nom d'affichage.",
    how2: "Entrez dans un salon par thème, ou ouvrez le lien qu'on vous a partagé.",
    how3: "Écrivez dans votre langue. Chacun lit dans la sienne, et « Voir l'original » montre exactement votre texte.",
    nameLabel: "Nom d'affichage",
    namePlaceholder: "Choisissez un nom",
    langLabel: "Ma langue",
    continueBtn: "Continuer",
    enterRoomNote: "Vous rejoindrez « {room} » après cette étape.",
    helloRooms: "Bonjour, {name} ! Choisissez un salon et discutez.",
    roomsHeading: "Salons",
    changeIdentity: "Changer d'identité",
    copyLink: "Copier le lien",
    copied: "Copié",
    notFoundTitle: "Salon introuvable",
    notFoundBody: "Le salon « {room} » n'existe pas — le lien est peut-être erroné.",
    backToRooms: "Retour aux salons",
    privacyLink: "Confidentialité",
    termsLink: "Conditions",
    leave: "← Quitter",
    connected: "Connecté",
    connecting: "Connexion…",
    reconnecting: "Reconnexion…",
    offlineBanner: "Connexion perdue, reconnexion en cours… Impossible d'envoyer des messages pour le moment.",
    joiningRoom: "Entrée dans le salon…",
    emptyRoom: "Pas encore de messages — dites bonjour !",
    inputPlaceholder: "Écrivez un message…",
    sendBtn: "Envoyer",
    showOriginal: "Voir l'original",
    hideOriginal: "Masquer l'original",
    translating: "Traduction…",
    translationFailed: "Traduction indisponible — touchez pour voir l'original",
    inviteBtn: "Inviter",
    inviteCopied: "Lien d'invitation copié",
    report: "Signaler",
    reportPlaceholder: "Motif (facultatif)",
    submitting: "Envoi…",
    submitBtn: "Envoyer",
    cancel: "Annuler",
    reportDone: "Signalement reçu, merci",
    reportFailed: "Échec de l'envoi, réessayez plus tard",
    errBadJson: "Message mal formé",
    errNotJoined: "Rejoignez d'abord le salon",
    errTooLong: "Message trop long, veuillez le raccourcir",
    errFiltered: "Message bloqué par le filtre, reformulez-le",
    errRateLimited: "Vous envoyez trop vite — faites une pause",
    errBadReport: "Impossible d'envoyer le signalement, réessayez",
    errFallback: "Une erreur est survenue, réessayez",
    roomLobbyTitle: "Accueil",
    roomLobbyTopic: "Discussion libre — rencontrez des gens du monde entier",
    roomTravelTitle: "Voyages",
    roomTravelTopic: "Destinations, conseils et histoires de route",
    roomFoodTitle: "Cuisine",
    roomFoodTopic: "Plats locaux, street food et cuisine maison",
    roomLanguageTitle: "Échange linguistique",
    roomLanguageTopic: "Enseignez-vous mutuellement — pratiquez l'oral et l'écrit",
  },
}

export function t(lang: LanguageCode, key: keyof Strings, params?: Record<string, string>): string {
  const zh = STRINGS.zh
  if (!zh) return key
  const dict = STRINGS[lang] ?? zh
  let text = dict[key] ?? zh[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, value)
    }
  }
  return text
}

/** 服务端 error code → 本地化提示；未知 code 用通用文案，不透出服务端原文。 */
export function serverErrorMessage(lang: LanguageCode, code: string): string {
  const keyMap: Record<string, keyof Strings> = {
    bad_json: "errBadJson",
    not_joined: "errNotJoined",
    too_long: "errTooLong",
    filtered: "errFiltered",
    rate_limited: "errRateLimited",
    bad_report: "errBadReport",
  }
  return t(lang, keyMap[code] ?? "errFallback")
}

/** 内置房间的本地化标题与话题。 */
export function roomMeta(
  lang: LanguageCode,
  slug: string,
  fallback: { title: string; topic: string },
): { title: string; topic: string } {
  const keyMap: Record<string, [keyof Strings, keyof Strings]> = {
    lobby: ["roomLobbyTitle", "roomLobbyTopic"],
    travel: ["roomTravelTitle", "roomTravelTopic"],
    food: ["roomFoodTitle", "roomFoodTopic"],
    language: ["roomLanguageTitle", "roomLanguageTopic"],
  }
  const keys = keyMap[slug]
  if (!keys) return fallback
  return { title: t(lang, keys[0]), topic: t(lang, keys[1]) }
}

/** 隐私说明（草稿）：只描述产品真实做的事，不虚构主体和承诺。 */
export function privacyDoc(lang: LanguageCode): DocSection[] {
  return {
    zh: [
      { h: "我们处理哪些信息", p: [
        "WorldChat 不设账号，不收集邮箱、手机号或支付信息。进入聊天时只需要一个显示名称和你的界面语言，它们保存在你浏览器的本地存储里，清除浏览器数据即删除。",
        "你发送的消息（含发送者显示名称、语言、时间）会保存在房间所在的服务器存储中。每个房间只保留最近约 100 条消息和它们的译文，供后来进入的人查看。",
      ] },
      { h: "消息会交给翻译服务", p: [
        "为了让不同语言的人聊天，你发送的消息文本会交给机器翻译服务（当前包括 Cloudflare Workers AI、Google 与 MyMemory 的免费接口）生成译文，译文会缓存并展示给房间里其他人。",
        "请勿在聊天中发送密码、证件号等敏感个人信息——消息内容会经过上述第三方服务。",
      ] },
      { h: "举报记录", p: [
        "当你举报一条消息时，消息编号、举报理由和你的显示名称会保存在房间存储中，用于处理滥用行为。每个房间最多保留最近 500 条举报记录。",
      ] },
      { h: "我们不做的事", p: [
        "本服务不投放广告、不出售用户数据、不做跨站追踪。",
      ] },
      { h: "说明的更新", p: [
        "功能变化时我们会更新本页。继续使用即视为接受更新后的说明。",
      ] },
    ],
    en: [
      { h: "What we process", p: [
        "WorldChat has no accounts. We don't collect email addresses, phone numbers, or payment information. Chatting only requires a display name and your interface language, both stored in your browser's local storage — clearing your browser data removes them.",
        "Messages you send (with display name, language, and time) are kept in server storage for the room. Each room keeps only the most recent ~100 messages and their translations so later visitors can catch up.",
      ] },
      { h: "Messages go to translation services", p: [
        "To let people chat across languages, the text of your messages is sent to machine-translation services (currently free tiers of Cloudflare Workers AI, Google, and MyMemory) to produce translations, which are cached and shown to others in the room.",
        "Please don't send sensitive personal information such as passwords or ID numbers in chat — message text passes through the services above.",
      ] },
      { h: "Reports", p: [
        "When you report a message, the message ID, your reason, and your display name are stored with the room to handle abuse. Each room keeps at most the latest 500 reports.",
      ] },
      { h: "What we don't do", p: [
        "This service runs no ads, sells no user data, and does no cross-site tracking.",
      ] },
      { h: "Changes to this notice", p: [
        "We'll update this page as the product changes. Continued use means you accept the updated notice.",
      ] },
    ],
    ja: [
      { h: "扱う情報", p: [
        "WorldChat にはアカウントがなく、メールアドレス・電話番号・支払い情報は収集しません。チャットに必要なのは表示名とインターフェース言語だけで、どちらもブラウザのローカルストレージに保存されます。ブラウザのデータを削除すれば消えます。",
        "送信したメッセージ（表示名・言語・時刻を含む）は、その部屋のサーバー保存領域に保存されます。各部屋には直近の約 100 件のメッセージとその翻訳だけが残り、後から入った人が会話を追えます。",
      ] },
      { h: "メッセージは翻訳サービスに渡されます", p: [
        "異なる言語どうしの会話を可能にするため、メッセージ本文は機械翻訳サービス（現在は Cloudflare Workers AI・Google・MyMemory の無料枠）に送られて翻訳され、その訳文はキャッシュされて部屋の他の人に表示されます。",
        "パスワードや身分証番号などの機密個人情報はチャットで送らないでください。本文は上記のサービスを経由します。",
      ] },
      { h: "通報記録", p: [
        "メッセージを通報すると、メッセージ ID・理由・あなたの表示名が、不正利用への対応のため部屋の保存領域に記録されます。各部屋には直近 500 件までの通報が残ります。",
      ] },
      { h: "行わないこと", p: [
        "本サービスは広告を掲載せず、ユーザーデータを販売せず、サイト横断トラッキングも行いません。",
      ] },
      { h: "本説明の更新", p: [
        "機能の変化に応じて本ページを更新します。更新後も利用を続けると、更新後の説明に同意したものとみなされます。",
      ] },
    ],
    es: [
      { h: "Qué tratamos", p: [
        "WorldChat no tiene cuentas: no recopilamos correos, números de teléfono ni datos de pago. Para chatear solo hacen falta un nombre para mostrar y tu idioma, guardados en el almacenamiento local de tu navegador; borrar los datos del navegador los elimina.",
        "Los mensajes que envías (con nombre, idioma y hora) se guardan en el almacenamiento del servidor de la sala. Cada sala conserva solo los últimos ~100 mensajes y sus traducciones, para que quien entre después pueda ponerse al día.",
      ] },
      { h: "Los mensajes pasan por servicios de traducción", p: [
        "Para que personas de distintos idiomas conversen, el texto de tus mensajes se envía a servicios de traducción automática (actualmente los niveles gratuitos de Cloudflare Workers AI, Google y MyMemory); las traducciones se guardan en caché y se muestran al resto de la sala.",
        "No envíes en el chat información personal sensible como contraseñas o números de identidad: el texto pasa por los servicios anteriores.",
      ] },
      { h: "Denuncias", p: [
        "Al denunciar un mensaje, el identificador del mensaje, tu motivo y tu nombre se guardan con la sala para tratar abusos. Cada sala conserva como máximo las últimas 500 denuncias.",
      ] },
      { h: "Lo que no hacemos", p: [
        "Este servicio no muestra publicidad, no vende datos de usuarios y no hace rastreo entre sitios.",
      ] },
      { h: "Cambios en este aviso", p: [
        "Actualizaremos esta página cuando cambie el producto. Seguir usándola implica aceptar la versión actualizada.",
      ] },
    ],
    fr: [
      { h: "Ce que nous traitons", p: [
        "WorldChat n'a pas de comptes : nous ne collectons ni e-mail, ni numéro de téléphone, ni informations de paiement. Discuter ne demande qu'un nom d'affichage et votre langue d'interface, conservés dans le stockage local de votre navigateur — effacer les données du navigateur les supprime.",
        "Les messages que vous envoyez (avec nom, langue et horodatage) sont conservés dans le stockage du salon. Chaque salon ne garde que les ~100 derniers messages et leurs traductions, afin que les nouveaux arrivants puissent suivre.",
      ] },
      { h: "Les messages passent par des services de traduction", p: [
        "Pour permettre des conversations multilingues, le texte de vos messages est envoyé à des services de traduction automatique (actuellement les offres gratuites de Cloudflare Workers AI, Google et MyMemory) ; les traductions sont mises en cache et affichées aux autres membres du salon.",
        "N'envoyez pas en chat d'informations personnelles sensibles (mots de passe, numéros de pièce d'identité) : le texte transite par ces services.",
      ] },
      { h: "Signalements", p: [
        "Lorsque vous signalez un message, l'identifiant du message, votre motif et votre nom sont conservés avec le salon pour traiter les abus. Chaque salon garde au plus les 500 derniers signalements.",
      ] },
      { h: "Ce que nous ne faisons pas", p: [
        "Ce service n'affiche aucune publicité, ne vend aucune donnée et n'effectue aucun suivi intersites.",
      ] },
      { h: "Mises à jour de cette notice", p: [
        "Nous mettrons cette page à jour avec le produit. Continuer à l'utiliser vaut acceptation de la version à jour.",
      ] },
    ],
  }[lang] ?? []
}

/** 服务条款（草稿）。 */
export function termsDoc(lang: LanguageCode): DocSection[] {
  return {
    zh: [
      { h: "服务性质", p: [
        "WorldChat 是免费的跨语言聊天服务，按「现状」提供，不承诺持续可用。我们可能调整功能，也可能停止服务。",
      ] },
      { h: "行为规范", p: [
        "禁止发布违法内容、骚扰他人、发布垃圾广告或恶意刷屏。违规消息会被过滤，举报会被记录并可能据此限制使用。",
      ] },
      { h: "你发的内容由你负责", p: [
        "消息会展示给房间内的其他人，并由机器翻译成他们的语言。机器翻译可能出错，每条译文都可「查看原文」，请自行判断；对你发送的内容，责任由你本人承担。",
      ] },
      { h: "免责与责任限制", p: [
        "本服务不保证翻译正确或服务不中断。在法律允许的范围内，对因使用本服务产生的损失不承担责任。",
      ] },
      { h: "条款更新", p: [
        "条款如有更新会发布在本页。继续使用即视为接受更新后的条款。",
      ] },
    ],
    en: [
      { h: "Nature of the service", p: [
        "WorldChat is a free multilingual chat service provided \"as is\", with no promise of continuous availability. Features may change and the service may be discontinued.",
      ] },
      { h: "Conduct", p: [
        "Don't post illegal content, harass others, spam, or flood the room. Rule-breaking messages are filtered, and reports are recorded and may lead to restrictions.",
      ] },
      { h: "You're responsible for what you send", p: [
        "Messages are shown to others in the room and machine-translated into their languages. Machine translation can be wrong — every translation has “Show original”, so judge for yourself. You remain responsible for the content you send.",
      ] },
      { h: "Disclaimers", p: [
        "We don't guarantee translation accuracy or uninterrupted service. To the extent permitted by law, we're not liable for losses arising from use of the service.",
      ] },
      { h: "Changes to these terms", p: [
        "Updates are published on this page. Continued use means you accept the updated terms.",
      ] },
    ],
    ja: [
      { h: "サービスの性質", p: [
        "WorldChat は無料の多言語チャットサービスで、「現状有姿」で提供され、継続的な可用性は保証されません。機能は変更されたり、サービスは終了する場合があります。",
      ] },
      { h: "行動規範", p: [
        "違法なコンテンツの投稿、他者への嫌がらせ、スパム広告、意図的な連投は禁止です。違反メッセージはフィルタリングされ、通報は記録され、利用制限の対象になることがあります。",
      ] },
      { h: "送信内容の責任", p: [
        "メッセージは部屋の他の人に表示され、機械翻訳されて伝わります。機械翻訳は誤ることがあり、すべての訳文に「原文を見る」が付きますのでご自身でご判断ください。送信内容に対する責任は送信者本人にあります。",
      ] },
      { h: "免責", p: [
        "翻訳の正確性やサービスの中断がないことは保証しません。法律で認められる範囲内で、本サービスの利用により生じた損失について責任を負いません。",
      ] },
      { h: "規約の更新", p: [
        "更新は本ページで公開します。更新後も利用を続けると、更新後の規約に同意したものとみなされます。",
      ] },
    ],
    es: [
      { h: "Naturaleza del servicio", p: [
        "WorldChat es un servicio de chat multilingüe gratuito ofrecido «tal cual», sin garantía de disponibilidad continua. Las funciones pueden cambiar y el servicio puede terminar.",
      ] },
      { h: "Comportamiento", p: [
        "No publiques contenido ilegal, acoses, hagas spam ni inundes la sala. Los mensajes que incumplan las normas se filtran, y las denuncias se registran y pueden derivar en restricciones.",
      ] },
      { h: "Responsabilidad por lo que envías", p: [
        "Los mensajes se muestran al resto de la sala y se traducen automáticamente a sus idiomas. La traducción automática puede fallar; toda traducción incluye «Ver original» para que juzgues por ti mismo. La responsabilidad del contenido enviado es tuya.",
      ] },
      { h: "Avisos", p: [
        "No garantizamos la exactitud de las traducciones ni la continuidad del servicio. En la medida permitida por la ley, no respondemos por pérdidas derivadas del uso del servicio.",
      ] },
      { h: "Cambios en los términos", p: [
        "Las actualizaciones se publican en esta página. Seguir usándolo implica aceptar los términos actualizados.",
      ] },
    ],
    fr: [
      { h: "Nature du service", p: [
        "WorldChat est un service de chat multilingue gratuit fourni « en l'état », sans garantie de disponibilité continue. Les fonctionnalités peuvent évoluer et le service peut être arrêté.",
      ] },
      { h: "Conduite", p: [
        "Ne publiez pas de contenus illégaux, ne harcelez personne, pas de spam ni de flood. Les messages non conformes sont filtrés, et les signalements sont enregistrés et peuvent entraîner des restrictions.",
      ] },
      { h: "Responsabilité de vos envois", p: [
        "Les messages sont montrés aux autres membres du salon et traduits automatiquement dans leurs langues. La traduction automatique peut se tromper ; chaque traduction propose « Voir l'original » pour juger par vous-même. Vous restez responsable du contenu que vous envoyez.",
      ] },
      { h: "Avertissements", p: [
        "Nous ne garantissons ni l'exactitude des traductions ni la continuité du service. Dans la mesure permise par la loi, nous ne sommes pas responsables des pertes liées à l'utilisation du service.",
      ] },
      { h: "Mises à jour des conditions", p: [
        "Les mises à jour sont publiées sur cette page. Continuer à utiliser le service vaut acceptation des conditions à jour.",
      ] },
    ],
  }[lang] ?? []
}

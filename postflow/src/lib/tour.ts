export interface TourStep {
  key: string;
  title: string;
  description: string;
  targetPath: string;
  icon: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    key: "dashboard",
    title: "Welcome to PostFlow!",
    description:
      "This is your command center. Get a bird's-eye view of your post activity, scheduled content, and connected accounts — all in one place.",
    targetPath: "/",
    icon: "🏠",
  },
  {
    key: "posts",
    title: "Create & Manage Posts",
    description:
      "Write, schedule, and publish content to multiple social platforms simultaneously. Use the post composer to craft your message, add media, and pick a time.",
    targetPath: "/posts",
    icon: "✍️",
  },
  {
    key: "accounts",
    title: "Connect Your Accounts",
    description:
      "Link Facebook, Instagram, Threads, LinkedIn, Twitter, and 14 more platforms. Once connected, you can publish to any combination with a single post.",
    targetPath: "/accounts",
    icon: "🔗",
  },
  {
    key: "calendar",
    title: "Visual Calendar View",
    description:
      "See all your scheduled and published posts on a monthly calendar. Drag and drop posts to reschedule them instantly.",
    targetPath: "/calendar",
    icon: "📅",
  },
  {
    key: "analytics",
    title: "Track Performance",
    description:
      "Monitor engagement metrics, view posting consistency, see your best times to post, and compare performance across platforms with interactive charts.",
    targetPath: "/analytics",
    icon: "📊",
  },
  {
    key: "queue",
    title: "Optimal Posting Queue",
    description:
      "Define your preferred posting time windows. Then use 'Add to Queue' to automatically schedule posts at your next available slot — no manual time picking needed.",
    targetPath: "/queue",
    icon: "⏱️",
  },
  {
    key: "templates",
    title: "Content Templates",
    description:
      "Save frequently used post formats as templates. Load them in the composer to quickly build new posts without starting from scratch.",
    targetPath: "/templates",
    icon: "📋",
  },
  {
    key: "schedules",
    title: "Recurring Schedules",
    description:
      "Set up recurring posts using cron expressions. Perfect for regular content series, weekly reminders, or automated evergreen content.",
    targetPath: "/schedules",
    icon: "🔄",
  },
  {
    key: "media",
    title: "Media Library",
    description:
      "Upload and organise your images and videos in one place. All media is stored on Cloudflare R2 and gets a public URL ready for Instagram and other platforms.",
    targetPath: "/media",
    icon: "🖼️",
  },
  {
    key: "settings",
    title: "Customise Your Experience",
    description:
      "Set your timezone, notification preferences, enable two-factor auth, manage API keys, and personalise the theme. You're all set — happy publishing!",
    targetPath: "/settings",
    icon: "⚙️",
  },
];

export const TOTAL_TOUR_STEPS = TOUR_STEPS.length;

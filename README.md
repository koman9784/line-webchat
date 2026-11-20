This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The main route (`/`) displays the admin chat dashboard instead of the customer chat.
Unauthenticated users are redirected to `/admin/login`; successful login returns to `/`.
The existing `/admin` route remains available.

## LINE user profiles

Before deploying the profile feature, run
[`supabase/migrations/202611200001_add_line_user_profiles.sql`](supabase/migrations/202611200001_add_line_user_profiles.sql)
in the Supabase SQL Editor. It adds nullable `display_name`, `picture_url`, and
`profile_checked_at` columns and enables conversation updates in Supabase Realtime.
Keep the existing conversation RLS policies enabled.

The webhook uses the server-only `LINE_CHANNEL_ACCESS_TOKEN` to fetch a user's
LINE profile after saving their text message. Each conversation makes at most one
profile request per 24 hours, including failed attempts. Failures are logged without
profile contents and do not prevent message storage; existing names and images are retained.
Existing conversations populate when the next text message arrives; no bulk backfill is performed.
The admin list and chat header show the stored name and photo, with a user ID/initials
fallback for missing profiles or an image that cannot be loaded.

`ajv`, already present through ESLint, is declared as a runtime dependency to validate
LINE's profile response. Profile API tests run with Node.js 24:

```bash
node --experimental-test-module-mocks --test tests/*.test.mjs
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

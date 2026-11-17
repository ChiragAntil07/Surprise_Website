# A little surprise

A small, consent-first surprise page. Every time the surprise is opened, the browser records up to 10 seconds from the camera and microphone, then locks the surprise again.

## Privacy and storage behavior

- The recording notice is shown before the surprise can be opened.
- Camera and microphone access are requested only after the visitor agrees and taps **Open my surprise**.
- The surprise photo is public so it can be displayed to visitors. Reaction clips are uploaded to a private Supabase Storage bucket.
- The `/admin` page requires an authorized Supabase email/password account to manage the photo and view, download, or delete reaction clips.
- Visitors do not need an account to upload a reaction. The clip bucket enforces a 25 MB file limit and accepts only supported video formats.
- Public uploads can be abused to consume storage. Set usage alerts/quotas in Supabase and review the project's usage regularly.
- Hiding the page stops an active recording. Closing the page before a clip is ready may lose that clip.
- Set a retention period and delete clips when they are no longer needed.

## Configure Supabase

1. Create a Supabase project.
2. In **Project Settings → API**, copy the project URL and the publishable/anon key into a local `.env.local` file, using `.env.example` as a template. These browser values are public; never put a service-role key in the app.
3. In **SQL Editor**, run [`supabase/setup.sql`](./supabase/setup.sql).
4. In **Authentication → Users**, create the admin user with an email and password. Disable public sign-ups in Authentication settings.
5. In SQL Editor, add that user to the admin allowlist, replacing the email:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'admin@example.com'
on conflict do nothing
returning user_id;
```

The SQL creates a public photo bucket, a private reaction bucket, an admin allowlist, a reaction metadata table, and row-level security policies. The registration function only records metadata for a clip that was actually uploaded. Do not make the reaction bucket public.

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

Set the real Supabase URL and publishable/anon key in `.env.local`, then open the local Vite URL. Camera access works on `localhost` or HTTPS.

## Deploy to Vercel

Import the repository into Vercel. Vercel detects Vite; the build command is `npm run build` and the output directory is `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Project Settings → Environment Variables**, then redeploy. The `/admin` rewrite is configured in `vercel.json`.

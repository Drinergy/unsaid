# Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Variables
Ensure all environment variables are set in your deployment platform:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `NEXT_PUBLIC_MAPTILER_KEY`
- `ID_HASH_SECRET` (server-side only)
- `NEXT_PUBLIC_APP_URL` (production URL)

### 2. Database Setup

1. **Run Migrations**: Execute all SQL migrations in order:
   - `001_initial_schema.sql`
   - `003_spatial_functions.sql`
   - `004_security_hardening.sql`
   - `005_cluster_function.sql`
   - `006_reactions.sql`
   - `007_reaction_types.sql`
   - `008_reply_location.sql`
   - `009_report_ips_and_reply_depth.sql`

2. **Enable PostGIS**: Ensure PostGIS extension is enabled in Supabase:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

3. **Enable Realtime**: In Supabase Dashboard:
   - Go to Database → Replication
   - Enable replication for `unsaids` and `replies` tables

4. **Row Level Security**: Verify RLS policies are active (they're created in migration 001)

### 3. MapTiler Configuration

1. Create a MapTiler account and API key (cloud.maptiler.com)
2. Restrict the key (recommended, it is visible in the browser):
   - Allowed HTTP Origins: your production domain

### 4. Supabase Configuration

1. **CORS Settings**: Add your production domain to Supabase CORS settings
2. **Rate Limiting**: Configure API rate limits in Supabase dashboard
3. **Connection Pooling**: Enable connection pooling for better performance

## Vercel Deployment

### Step 1: Connect Repository
1. Push code to GitHub/GitLab/Bitbucket
2. Import project in Vercel dashboard

### Step 2: Configure Environment Variables
Add all environment variables in Vercel project settings:
- Go to Settings → Environment Variables
- Add each variable for Production, Preview, and Development

### Step 3: Build Settings
Vercel auto-detects Next.js, but verify:
- Framework Preset: Next.js
- Build Command: `npm run build`
- Output Directory: `.next` (default)

### Step 4: Deploy
1. Click "Deploy"
2. Monitor build logs for errors
3. Test deployed site

## Post-Deployment

### 1. Verify Functionality
- [ ] Map loads correctly
- [ ] Can create new Unsads
- [ ] Can view Unsads on map
- [ ] Can create replies
- [ ] Realtime updates work
- [ ] Rate limiting works
- [ ] Reporting works

### 2. Performance Monitoring
- Monitor Vercel Analytics
- Check Supabase dashboard for query performance
- Monitor API response times

### 3. Security Checklist
- [ ] Environment variables are not exposed in client code
- [ ] Service role key is server-side only
- [ ] CORS is properly configured
- [ ] Rate limiting is active
- [ ] RLS policies are enforced

### 4. Error Monitoring
Set up error tracking (optional):
- Vercel has built-in error tracking
- Consider Sentry for detailed error reports

## Troubleshooting

### Map Not Loading
- Check `NEXT_PUBLIC_MAPTILER_KEY` is set and valid
- Check the key's allowed origins include your domain
- Check browser console for errors

### Database Errors
- Verify PostGIS extension is enabled
- Check RLS policies allow necessary operations
- Verify migrations ran successfully

### Realtime Not Working
- Ensure replication is enabled for tables
- Check Supabase Realtime status
- Verify WebSocket connections aren't blocked

### Rate Limiting Issues
- Rate limits count rows in `unsaids` / `replies` (no separate table); check `device_id` and `ip_address` are being stored
- Verify triggers are working
- Check server logs for rate limit errors

## Scaling Considerations

### Database
- Monitor query performance
- Add indexes if needed
- Consider partitioning for large datasets (10M+ rows)

### API
- Monitor API response times
- Use Vercel Edge Functions for better performance
- Implement caching for popular queries

### Map Performance
- Monitor map rendering performance
- Adjust clustering settings if needed
- Consider reducing initial load size

## Maintenance

### Regular Tasks
- Monitor error logs weekly
- Review reported content (if admin dashboard exists)
- Check database size and performance
- Update dependencies monthly

### Backup Strategy
- Supabase provides automatic backups
- Consider additional backups for critical data
- Test restore procedures

## Support

For issues or questions:
1. Check application logs in Vercel
2. Check Supabase logs
3. Review browser console errors
4. Check network tab for API errors

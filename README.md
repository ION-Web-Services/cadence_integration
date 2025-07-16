# Go High Level Marketplace Integration

A TypeScript application that handles OAuth 2.0 authentication and token management for a Go High Level marketplace integration. This app supports multiple installations (multi-tenant) and automatically refreshes tokens.

## 🚀 Features

- **OAuth 2.0 Flow**: Handle GHL marketplace installation flow with automatic token exchange
- **Multi-tenant Architecture**: Support for 1000+ installations with isolated token management
- **Automatic Token Refresh**: Background refresh with 5-minute buffer before expiration
- **API Proxy**: Dynamic endpoint routing with automatic token injection and 401 handling
- **CORS Support**: Full CORS handling for frontend requests
- **Background Jobs**: Vercel cron jobs for token refresh
- **Comprehensive Error Handling**: Graceful handling of refresh failures and installation errors

## 🛠 Tech Stack

- **Frontend/Backend**: Next.js 14 with TypeScript
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel
- **Authentication**: OAuth 2.0 with Go High Level

## 📋 Prerequisites

- Node.js 18+ 
- Supabase account
- Go High Level marketplace app
- Vercel account (for deployment)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd dnc-api
npm install
```

### 2. Environment Setup

Create a `.env.local` file with the following variables:

```env
# Go High Level OAuth
GHL_CLIENT_ID=your_client_id
GHL_CLIENT_SECRET=your_client_secret
GHL_REDIRECT_URI=http://localhost:3000/api/oauth/callback

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Vercel Cron Security
CRON_SECRET=your_random_secret

# App Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Setup

Run the following SQL in your Supabase SQL editor:

```sql
CREATE TABLE cadence_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  location_id VARCHAR(255) NOT NULL,
  company_id VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  scopes TEXT[],
  is_active BOOLEAN DEFAULT true,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, location_id)
);

-- Index for efficient token refresh queries
CREATE INDEX idx_cadence_installations_expires_at ON cadence_installations(expires_at) WHERE is_active = true;
```

### 4. Go High Level Setup

1. Go to [Go High Level Marketplace](https://marketplace.gohighlevel.com/)
2. Create a new app or edit existing app
3. Configure OAuth settings:
   - Redirect URI: `http://localhost:3000/api/oauth/callback` (development)
   - Scopes: `contacts.readonly conversations.readonly locations.readonly users.readonly`
4. Copy your `CLIENT_ID` and `CLIENT_SECRET`

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the dashboard.

## 📚 API Documentation

### Installation Flow

1. **Installation URL**: `GET /` - Shows dashboard with installation link
2. **OAuth Callback**: `GET /api/oauth/callback` - Handles OAuth installation
3. **Success Page**: `GET /installation-success` - Shows installation details
4. **Error Page**: `GET /installation-error` - Shows error details

### API Proxy Usage

The API proxy automatically handles authentication and token refresh. Make requests to:

```
/api/ghl/{endpoint}
```

#### Headers Required

```
X-User-ID: your_user_id
X-Location-ID: your_location_id
```

#### Example Requests

```bash
# Get contacts
curl -X GET "http://localhost:3000/api/ghl/contacts" \
  -H "X-User-ID: user123" \
  -H "X-Location-ID: location456"

# Create contact
curl -X POST "http://localhost:3000/api/ghl/contacts" \
  -H "X-User-ID: user123" \
  -H "X-Location-ID: location456" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "firstName": "John"}'

# Get conversations
curl -X GET "http://localhost:3000/api/ghl/conversations" \
  -H "X-User-ID: user123" \
  -H "X-Location-ID: location456"
```

#### Supported Endpoints

- `/api/ghl/contacts` - Contact management
- `/api/ghl/conversations` - Conversation history
- `/api/ghl/locations` - Location information
- `/api/ghl/users` - User management
- `/api/ghl/oauth` - OAuth operations

### Background Jobs

- **Token Refresh**: `POST /api/cron/refresh-tokens` - Runs every hour via Vercel cron

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GHL_CLIENT_ID` | Go High Level app client ID | Yes |
| `GHL_CLIENT_SECRET` | Go High Level app client secret | Yes |
| `GHL_REDIRECT_URI` | OAuth redirect URI | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `CRON_SECRET` | Secret for cron job authentication | Yes |
| `NEXT_PUBLIC_APP_URL` | Your app's base URL | Yes |

### Token Management

- **Expiration**: GHL tokens expire in 86399 seconds (~24 hours)
- **Refresh Buffer**: Tokens are refreshed 5 minutes before expiration
- **Auto-retry**: Failed requests due to expired tokens are automatically retried

## 🚀 Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Production Environment Variables

Update your `.env.local` for production:

```env
GHL_REDIRECT_URI=https://yourdomain.com/api/oauth/callback
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Vercel Cron Configuration

The `vercel.json` file configures the cron job to run every hour:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-tokens",
      "schedule": "0 * * * *"
    }
  ]
}
```

## 🔍 Monitoring

### Logs

The application includes comprehensive logging:

- OAuth flow events
- Token refresh operations
- API request/response logging
- Error tracking

### Health Checks

- Token refresh success rates
- Installation status monitoring
- API proxy performance

## 🛡 Security

- **Token Storage**: Encrypted storage in Supabase
- **Cron Security**: Secret-based authentication for background jobs
- **Input Validation**: Sanitized user inputs
- **CORS**: Properly configured for cross-origin requests
- **Error Handling**: No sensitive data exposed in error messages

## 🐛 Troubleshooting

### Common Issues

1. **Token Refresh Fails**
   - Check if refresh token is valid
   - Verify GHL app credentials
   - Check Supabase connection

2. **Installation Fails**
   - Verify redirect URI matches GHL app settings
   - Check environment variables
   - Review OAuth scopes

3. **API Proxy Errors**
   - Ensure user_id and location_id are provided
   - Check installation status
   - Verify token validity

### Debug Mode

Enable debug logging by setting `NODE_ENV=development` in your environment variables.

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support, please contact:
- Email: support@example.com
- Documentation: [Link to docs]
- Issues: [GitHub Issues]

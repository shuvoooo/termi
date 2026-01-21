# Termo 🖥️

**Secure Server Management PWA** - SSH, SCP, RDP, and VNC from your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

> **🎯 NEW: RDP Support is Ready!** For quick RDP setup, see [SOLUTION.md](SOLUTION.md) or run `node start-all.js`

<p align="center">
  <img src="docs/screenshot.png" alt="Termo Dashboard" width="800">
</p>

## ✨ Features

### 🔐 Security First
- **AES-256-GCM** encryption for all stored credentials
- **Argon2id** password hashing with secure parameters
- **TOTP-based 2FA** (Google Authenticator, Authy compatible)
- Optional **master key encryption** for extra protection
- Zero-trust architecture - credentials decrypted only in memory

### 🖥️ Multi-Protocol Support
- **SSH** - Full terminal access with xterm.js
- **SCP** - Web-based file manager with upload/download
- **RDP** - Windows Remote Desktop via Guacamole
- **VNC** - Virtual Network Computing via Guacamole

### 📱 Mobile Optimized
- **PWA** - Install on any device
- **Virtual Keyboard** - Ctrl, Alt, Shift, Fn keys, arrows
- **Touch Gestures** - Optimized for touchscreens
- **Responsive Design** - Works on any screen size

### 📦 Self-Hosted
- **Docker Compose** deployment
- **PostgreSQL** database
- **No cloud dependencies**

---

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for development)

### 🎯 RDP Quick Start (Development)

**Get RDP working in 3 steps:**

1. **Start guacd daemon**
   ```powershell
   docker run -d -p 4822:4822 --name termo-guacd guacamole/guacd:1.5.4
   ```

2. **Run the setup script**
   ```powershell
   node start-all.js
   ```

3. **Go to http://localhost:3000** and add your RDP server!

📚 **Detailed guides:**
- [SOLUTION.md](SOLUTION.md) - Complete setup and troubleshooting
- [README_RDP_QUICKSTART.md](README_RDP_QUICKSTART.md) - Quick reference
- [RDP_SETUP_GUIDE.md](RDP_SETUP_GUIDE.md) - Detailed instructions

**Diagnostic tools:**
- `node diagnose-rdp.js` - Check all components
- `.\start-services.ps1` - Start gateway and web app

---

### Deploy with Docker

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/termo.git
   cd termo
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   
   # Generate secure keys
   openssl rand -base64 32  # For SESSION_SECRET
   openssl rand -base64 32  # For ENCRYPTION_KEY
   openssl rand -base64 32  # For GATEWAY_JWT_SECRET
   ```
   
   Edit `.env` and fill in the generated secrets.

3. **Start the stack**
   ```bash
   docker-compose up -d
   ```

4. **Initialize database**
   ```bash
   docker-compose exec web npx prisma migrate deploy
   ```

5. **Access Termo**
   
   Open http://localhost:3000 in your browser.

---

## 🛠️ Development

### Setup

```bash
# Install dependencies
npm install

# Setup database
cd apps/web
npx prisma generate
npx prisma db push

# Start development servers
npm run dev:all
```

### Project Structure

```
termo/
├── apps/
│   ├── web/                    # Next.js PWA
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   ├── components/     # React components
│   │   │   ├── lib/            # Utilities
│   │   │   │   ├── crypto/     # Encryption
│   │   │   │   ├── auth/       # Authentication
│   │   │   │   └── services/   # Business logic
│   │   │   └── types/          # TypeScript types
│   │   └── prisma/             # Database schema
│   │
│   └── gateway/                # WebSocket Gateway
│       └── src/
│           ├── handlers/       # SSH, SCP, Guacamole
│           └── auth/           # Token validation
│
├── docker/                     # Docker configs
├── docker-compose.yml
├── README.md
└── SECURITY.md
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Session encryption key (min 32 chars) | Yes |
| `ENCRYPTION_KEY` | AES-256 encryption key | Yes |
| `GATEWAY_JWT_SECRET` | Gateway authentication secret | Yes |
| `NEXT_PUBLIC_GATEWAY_URL` | WebSocket gateway URL | Yes |
| `POSTGRES_USER` | Database username | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |

### Generate Secure Keys

```bash
# Generate a secure random key
openssl rand -base64 32
```

---

## 📡 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / PWA                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Login   │  │ Dashboard│  │ Terminal │  │   SCP    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │   API    │  │   Auth   │  │  Crypto  │  │  Prisma  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└───────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    ┌──────────┐     ┌──────────┐      ┌──────────┐
    │ Gateway  │     │ PostgreSQL│     │   Redis  │
    │ (WS)     │     │          │      │          │
    └────┬─────┘     └──────────┘      └──────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌──────┐  ┌──────┐
│ SSH  │  │guacd │──────► RDP/VNC Servers
└──────┘  └──────┘
    │
    ▼
  SSH Servers
```

---

## 🔒 Security

Please read [SECURITY.md](SECURITY.md) for detailed information about:

- Encryption architecture
- Threat model
- Self-hosting best practices
- Vulnerability reporting

### Key Security Features

1. **Encryption at Rest**: All credentials encrypted with AES-256-GCM
2. **Secure Key Derivation**: Argon2id for passwords, PBKDF2 for master keys
3. **No Plaintext Storage**: Secrets never stored unencrypted
4. **Memory-Only Decryption**: Credentials decrypted only during active sessions
5. **Session Management**: Token-based sessions with revocation support
6. **2FA Support**: TOTP-based two-factor authentication

---

## 📖 API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create new account |
| `/api/auth/login` | POST | Authenticate user |
| `/api/auth/verify-2fa` | POST | Verify TOTP code |
| `/api/auth/logout` | POST | End session |
| `/api/auth/me` | GET | Get current user |

### Servers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/servers` | GET | List all servers |
| `/api/servers` | POST | Create server |
| `/api/servers/:id` | GET | Get server details |
| `/api/servers/:id` | PATCH | Update server |
| `/api/servers/:id` | DELETE | Delete server |

### Groups

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/groups` | GET | List all groups |
| `/api/groups` | POST | Create group |
| `/api/groups/:id` | PATCH | Update group |
| `/api/groups/:id` | DELETE | Delete group |

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [Apache Guacamole](https://guacamole.apache.org/) - RDP/VNC gateway
- [ssh2](https://github.com/mscdex/ssh2) - SSH client
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Prisma](https://www.prisma.io/) - Database ORM

---

<p align="center">
  Made with ❤️ for the self-hosting community
</p>

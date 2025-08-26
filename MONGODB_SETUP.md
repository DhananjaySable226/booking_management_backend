# MongoDB Setup Guide

## Option 1: Local MongoDB Installation

### Windows:
1. Download MongoDB Community Server from [mongodb.com](https://www.mongodb.com/try/download/community)
2. Install MongoDB
3. Start MongoDB service:
   ```cmd
   net start MongoDB
   ```

### macOS (using Homebrew):
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb/brew/mongodb-community
```

### Linux (Ubuntu):
```bash
sudo apt update
sudo apt install mongodb
sudo systemctl start mongod
sudo systemctl enable mongod
```

## Option 2: MongoDB Atlas (Cloud - Recommended)

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account
3. Create a new cluster (free tier)
4. Click "Connect"
5. Choose "Connect your application"
6. Copy the connection string
7. Replace `<password>` with your database password
8. Update your `.env` file with the new URI

## Testing Database Connection

After creating the `.env` file, test the connection:

```bash
cd backend
node setup-db.js
```

## Quick Start (No MongoDB Installation)

If you want to test without installing MongoDB locally, use MongoDB Atlas:

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create free account
3. Create cluster
4. Get connection string
5. Update `.env` file with Atlas URI
6. Run the application

## Environment Variables

Make sure your `.env` file contains:

```env
MONGODB_URI=mongodb://localhost:27017/booking-system
# OR for Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/booking-system
```

## Troubleshooting

- **Connection refused**: MongoDB service not running
- **Authentication failed**: Wrong username/password
- **Network timeout**: Check internet connection (for Atlas)
- **Invalid URI**: Check connection string format

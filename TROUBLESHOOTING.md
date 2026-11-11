# Troubleshooting Guide

## npm Global Install Permission Errors

### Problem
When running `npm install -g npm@11.8.0`, you may encounter permission errors like:
- `EACCES: permission denied`
- `Error: EACCES: permission denied, access '/usr/local/lib/node_modules'`

### Solutions

#### Option 1: Use sudo (Quick Fix - macOS/Linux)
```bash
sudo npm install -g npm@11.8.0
```

**Note**: Using `sudo` with npm is generally not recommended for security reasons, but it works for a quick fix.

#### Option 2: Fix npm Permissions (Recommended - macOS/Linux)
Change npm's default directory to avoid permission issues:

```bash
# Create a directory for global packages
mkdir ~/.npm-global

# Configure npm to use the new directory
npm config set prefix '~/.npm-global'

# Add to your shell profile (~/.zshrc or ~/.bashrc)
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc

# Reload your shell configuration
source ~/.zshrc

# Now install npm globally without sudo
npm install -g npm@11.8.0
```

#### Option 3: Use nvm (Node Version Manager) - Best Practice
This is the recommended approach for managing Node.js and npm versions:

**Install nvm:**
```bash
# macOS/Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# Or using Homebrew on macOS
brew install nvm
```

**After installation, restart your terminal or run:**
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

**Use nvm to manage Node.js:**
```bash
# Install latest LTS Node.js (comes with latest npm)
nvm install --lts

# Use the installed version
nvm use --lts

# Verify npm version (should be latest)
npm --version
```

#### Option 4: Update npm without global install
You can update npm using npm itself (if you have an older version):

```bash
# Update npm to latest version
npm install -g npm@latest

# Or specific version
npm install -g npm@11.8.0
```

If this fails with permissions, use one of the options above first.

### For This Project

**You don't actually need to update npm globally!** 

The project will work fine with npm 11.7.0 (which you already have). The `package.json` specifies package versions, and npm will install the correct versions locally in `node_modules`.

**To proceed with the project setup:**

1. **Skip the global npm update** - it's not required
2. **Just run**:
   ```bash
   cd /Users/ctrlkarldel/personal-project/unsaid
   npm install
   ```

This will install all project dependencies locally, which is what you need.

### Verify Your Setup

After any of the above solutions, verify:

```bash
# Check npm version
npm --version

# Check node version (should be 20+)
node --version

# Check npm can install packages
npm install --help
```

### Common Issues

#### Issue: "command not found: npm" after fixing permissions
**Solution**: Restart your terminal or run `source ~/.zshrc` (or `~/.bashrc`)

#### Issue: npm works but packages can't be found
**Solution**: Check your PATH includes npm's bin directory:
```bash
echo $PATH
# Should include: ~/.npm-global/bin or /usr/local/bin
```

#### Issue: Different npm version in different terminals
**Solution**: Make sure your shell profile (~/.zshrc or ~/.bashrc) is loaded in all terminals

## Other Common Issues

### Node.js Version Too Old
If you get errors about Node.js version:

```bash
# Check current version
node --version

# Should be 20+ for Next.js 16
# If not, install Node.js 20+ from nodejs.org or use nvm
```

### npm install Fails
If `npm install` fails in the project:

1. **Clear npm cache**:
   ```bash
   npm cache clean --force
   ```

2. **Delete node_modules and lock file**:
   ```bash
   rm -rf node_modules package-lock.json
   ```

3. **Try again**:
   ```bash
   npm install
   ```

### Permission Errors During npm install
If you get permission errors when installing project dependencies:

```bash
# Make sure you're not using sudo for project installs
# Project dependencies should install locally (no sudo needed)

# If you still get errors, check npm cache permissions
sudo chown -R $(whoami) ~/.npm
```

## Getting Help

If none of these solutions work:
1. Check npm's official troubleshooting: https://docs.npmjs.com/troubleshooting
2. Check your system's Node.js installation method (Homebrew, nvm, official installer)
3. Verify your PATH environment variable includes npm's location

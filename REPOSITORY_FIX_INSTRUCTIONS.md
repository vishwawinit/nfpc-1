# Repository Structure Fix Instructions

## Problem
The GitHub repository shows `nfpc/farmley-reports-nextjs-master/` nested structure instead of having project files at the root level.

## Solution

### Option 1: Manual Fix (Recommended)
1. **Delete the current repository** on GitHub (go to Settings > Danger Zone > Delete Repository)
2. **Create a new repository** called `nfpc` on GitHub  
3. **Move files to correct location:**
   ```bash
   # Navigate to the correct project root (where package.json is)
   cd "d:\vishwa\NFPC\farmley-reports-nextjs-master\farmley-reports-nextjs-master"
   
   # Remove existing git remote
   git remote remove origin
   
   # Add new remote to fresh repository
   git remote add origin https://github.com/vishwawinit/nfpc.git
   
   # Push to new repository
   git push -u origin master
   ```

### Option 2: Keep Current Repository and Fix Structure
If you want to keep the existing repository:
1. Go to GitHub repository: https://github.com/vishwawinit/nfpc.git
2. The files will appear under `farmley-reports-nextjs-master/` folder
3. This is not ideal but functional

### Option 3: GitHub Web Interface Fix  
1. Download the repository as ZIP from GitHub
2. Extract files from `farmley-reports-nextjs-master/` folder
3. Delete the old repository on GitHub
4. Create new repository
5. Upload files directly to root level

## Expected Final Structure
After fix, the repository should show:
```
nfpc/
├── .env
├── .gitignore  
├── package.json
├── next.config.js
├── src/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   └── ...
├── public/
└── ...
```

NOT:
```
nfpc/
└── farmley-reports-nextjs-master/
    ├── .env
    ├── package.json
    └── ...
```

## Current Status
The repository is functional but has nested structure. Choose Option 1 for cleanest result.

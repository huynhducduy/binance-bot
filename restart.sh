git reset --hard
git pull
npm ci
pm2 restart nft
pm2 restart watcher
pm2 restart abnormal

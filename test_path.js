const path = require('path');
const workspacePath = '/home/user/workspace';
const rootPath = '/home/user/workspace/../something';
console.log(rootPath.startsWith(workspacePath));

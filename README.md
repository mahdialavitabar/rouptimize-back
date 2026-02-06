# API

{
"name": "api",
"private": true,
"scripts": {
"dev": "bun src/main.ts",
"build": "tsc -p tsconfig.json",
"start": "node dist/main.js"
},
"dependencies": {
"@nestjs/common": "^10.0.0",
"@nestjs/config": "^4.0.2",
"@nestjs/core": "^10.0.0",
"@nestjs/platform-express": "^10.0.0",
"@nestjs/swagger": "^11.2.0",
"@nestjs/typeorm": "^11.0.0",
"joi": "^17.13.3",
"pg": "^8.16.3",
"reflect-metadata": "^0.1.13",
"rxjs": "^7.8.0",
"swagger-ui-express": "^5.0.1",
"typeorm": "^0.3.25"
},
"devDependencies": {
"@types/node": "^20.19.9",
"ts-node": "^10.9.2",
"typescript": "^5.8.3"
}
}

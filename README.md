# sporttech.io OVS API extension 
This project is an API adapter built with Node.js. It connects to a OVS using EventSource, updates an in-memory data model, and exposes proccessed data via an HTTP API.

## Features

- Connects to a service using EventSource
- Updates data model with received updates
- Exposes the current state of the data model via an HTTP API

## Requirements

- Node.js
- Docker (optional, for containerized deployment)

## Installation

1. Clone the Repository and install dependencies

```sh
git clone git@github.com:sporttech/sporttechio-ovs-api-ext.git
cd sporttechio-ovs-api-ext
npm install
```
2. Edit the OVS URL, request, and config in .env

Edit the OVS basename and request inside the .env file i.e.

```
OVS_URL=https://sporttech.io/events/0aaa0cc5-bc38-4ce6-6dd0-eff5a170a7ed/ovs
OVS_API_REQUEST=/api/event?fetch_event_competitions=true&fetch_competition_stages=true&fetch_stage_groups=true&fetch_group_performances=true&fetch_performance_frames=true&fetch_performance_athletes=true&fetch_panels=true
EXTENSIONS=vmixLivesportAG,vmixLivesportTRA
CONFIG_VMIX_LIVESPORT_AG_FILE="./vmixLivesportAGConfig.json"
CONFIG_VMIX_LIVESPORT_TRA_FILE="./vmixLivesportTRAConfig.json"
```

## Run
```
node index.js
```
or with monitoring:
```
npx nodemon index.js
```

## Extending API

To extend API one should create `.js` file inside the extensions folder, i.e. `extensions/newEndpoint.js`. 
+ Use `vmixLivesportTRA.js` as example. 
+ Module should export `register` function:
  + `export async function register(app, model, addUpdateListner)`
  + This function will be called on application start
  + `app` is express instance, use it to add the endpoints
  + `model` is the data object that will contain up-to-date copy of the data from OVS
  + `addUpdateListner` callback function allow to register callback for any model update
+ To load extension on boot edit .env file, add extension name to `EXTENSIONS` section i.e. `EXTENSIONS=newEndpoint`
+ One can use additional enviroment variables, i.e. to pass config filename to the extension


## Docker local build / run
Build docker image:
```
docker build -t sporttech.io/api-ext .
```
Run image on the host 3300 port:
```
 docker run --name "sporttech-api-ext" -p 3300:3000 -v ./.env:/home/node/sporttech.io/api-ext/.env -v ./extensions/vmixLivesportTRAConfig.json:/home/node/sporttech.io/api-ext/extensions/vmixLivesportTRAConfig.json -d sporttech.io/api-ext
 ```

Push to public dockerhub:
```
docker build --platform linux/amd64 -t sporttech.io/api-ext . 
docker tag sporttech.io/api-ext psholukha/sporttech.io-api-ext
docker push psholukha/sporttech.io-api-ext
```

## Docker on server notes
* Config files are stored in `/sporttech.io/api-ext`, use vi/nano to edit files
* Download docker image: `docker pull psholukha/sporttech.io-api-ext`
* Stop running container: `docker stop CONTRAINER_ID`
* List all containers, including stopped: `docker ps -a`
* Rename container: `docker rename CONTAINER_ID NEW_NAME`
* Run image: 
```
 docker run --name "sporttech-api-ext" -p 3300:3000 -v /sporttech.io/api-ext/env:/home/node/sporttech.io/api-ext/.env -v /sporttech.io/api-ext/config.json:/home/node/sporttech.io/api-ext/extensions/config.json --log-driver json-file --log-opt max-size=1024k --log-opt max-file=4  -d psholukha/sporttech.io-api-ext
```
* Check running container ID: `docker ps`
* Restart running container, to update env or config: `docker restart CONTAINER_ID`
* View last 200 log records and follow: `docker logs -f --tail 200 CONTAINER_ID`
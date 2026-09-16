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

## AG participant and team enrichment

`MatchAthleteBy` names a direct field of the OVS `Athlete` object, such as `Bib`, `ExternalID`, `ID`, or `GUID`. Keys in `athletes` must contain values of that field; numeric and string values match equally. Missing or duplicate OVS keys are not enriched. The `bib` output uses `Athlete.Bib` when available and falls back to `ExternalID` for older OVS versions; `UseAthleteIDInsteadOfBib` continues to override both with the internal `Athlete.ID`.

`GET /vmix/ag/teamresults/:sids/chunk/:size` accepts optional `sortBy=TeamID` to order rows by `teamID` instead of team rank (default). The `rank` field still shows the OVS team rank.

`EnableAthleteEnrichment` adds `age`, `level`, `city`, and `accolades` to AG startlists, sessions, results, and active groups. It also allows configured `bib`, `name`, and `representing` overrides. `EnableTeamEnrichment` adds `teamDescription` to team results and allows team name and flag overrides. Each key in a team's `results` object becomes a separate vMix column: for example, `results.GPL24` and `results.GPL25` produce `GPL24_n1` and `GPL25_n1`. `AthleteFieldPriority` (`ovs` or `config`) selects the preferred source for athlete fields, falling back to the other source when a value is empty. Configured age is the reference number from the supplied GPL document; OVS age is calculated from `DateOfBirth`.

`RepresentingPart` (`before`, `after`, `full`, or `event`) selects the part used for representation. `event` follows `ShowAthleteCountryFlag`. `CityRepresentingPart` selects the part considered a city when OVS is preferred. Team entries may define `representing`, `representing2`, `flag`, and `city`; athlete entries may override `representing`, `representing2`, and `city`. `rawRepr` always contains the original OVS value.

In AG versus mode (`CalcModeTeamVersus`), team `score`, `pscore`, `arscore`, and apparatus scores are integer points. Individual routine scores remain gymnastics marks with three decimal places.

`GET /vmix/ag/stage/:sids/groups` returns the same athlete-per-apparatus rows as `active-groups`, using every group from the requested stage instead of the recent-frame buffer. One stage ID or multiple hyphen-separated IDs are accepted; unknown stages produce no rows.

## Extending API

To extend API one should create `.js` file inside the extensions folder, i.e. `extensions/newEndpoint.js`. 
+ Use `vmixLivesportTRA.js` as example. 
+ Module should export `register` function:
  + `export async function register(app, model, addUpdateListner)`
  + This function will be called on application start
  + `app` is an Express instance
  + `model` is the data object that will contain up-to-date copy of the data from OVS
  + `addUpdateListner` callback function allow to register callback for any model update
+ Register extension routes with `registerEndpoint` from `logRoutes.js`. Its descriptor is exposed by `/endpoints` and rendered as an interactive form on the adapter home page:

```js
registerEndpoint(app, {
    method: 'get',
    path: '/example/:sids',
    title: 'Example',
    parameters: [{
        name: 'sids', in: 'path', control: 'text', required: true,
        defaultValue: '0', label: 'Stage IDs'
    }],
    variants: []
}, handler);
```

Parameter controls can be `text`, `number`, or `enum`; parameters can be placed in the path or query string. Enum options use `{ value, label }`. Set `multiple: true` and `separator: "-"` for a multi-value path parameter. Each named variant contains a `label` and a `values` object used to prefill controls.

+ To load extension on boot edit .env file, add extension name to `EXTENSIONS` section i.e. `EXTENSIONS=newEndpoint`
+ One can use additional enviroment variables, i.e. to pass config filename to the extension


## Docker local build / run
Build docker image:
```
docker build -t sporttech.io/api-ext .
```
Run image on the host 3300 port:
```
 docker run --name "sporttech-api-ext" -p 3300:3000 -v ./.env:/home/node/sporttech.io/api-ext/.env -v ./extensions/vmixLivesportTRAConfig.json:/home/node/sporttech.io/api-ext/extensions/vmixLivesportTRAConfig.json -v ./extensions/vmixLivesportAGConfig.json:/home/node/sporttech.io/api-ext/extensions/vmixLivesportAGConfig.json -d sporttech.io/api-ext
 ```

Push to public dockerhub:
```
docker build --platform linux/amd64 -t sporttech.io/api-ext . 
docker tag sporttech.io/api-ext psholukha/sporttech.io-api-ext
docker push psholukha/sporttech.io-api-ext
```

## Docker on server notes
* Config files are stored in `/sporttech.io/api-ext`, use vi/nano to edit files
* Build and deploy docker image using npm scripts:
  * `npm run docker:build` - Build docker image for linux/amd64 platform
  * `npm run docker:tag` - Tag image for dockerhub
  * `npm run docker:push` - Push image to dockerhub
  * `npm run docker:deploy` - Run all above commands in sequence
* Download docker image: `docker pull psholukha/sporttech.io-api-ext`
* Stop running container: `docker stop CONTRAINER_ID`
* List all containers, including stopped: `docker ps -a`
* Rename container: `docker rename CONTAINER_ID NEW_NAME`
* Run image:

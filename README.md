# sporttech.io OVS API extension 
This project is an API adapter built with Node.js. It connects to a OVS using EventSource, updates an in-memory data model, and exposes the data via an HTTP API.

## Features

- Connects to a service using EventSource
- Updates data model with received updates
- Exposes the current state of the data model via an HTTP API

## Requirements

- Node.js
- npm (Node Package Manager)
- Docker (optional, for containerized deployment)

## Installation

1. Clone the Repository and install dependencies

```sh
git clone git@github.com:sporttech/sporttechio-ovs-api-ext.git
cd sporttechio-ovs-api-ext
npm install
```
2. Edite the OVS URL and request

Edite the OVS basename and request inside the .env file i.e.

```
SERVICE_URL=http://localhost:9003/api/event?fetch_event_competitions=true&fetch_competition_stages=true&fetch_stage_groups=true&fetch_group_performances=true&fetch_performance_frames=true&fetch_performance_athletes=true
```

3. Run
```
node index.js
```
FROM node:11.8

#Create folder /app and working with /app folder
RUN mkdir -p /data/app
# set our node environment, either development or production
# defaults to production, compose overrides this to development on build and run
#ARG NODE_ENV=production
#ENV NODE_ENV $NODE_ENV

# default to port 3000 for node, and 5858 or 9229 for debug
ARG PORT=4500
ENV PORT $PORT
EXPOSE $PORT 5858 9229

WORKDIR /data/app

COPY package*.json ./
RUN npm install && npm cache clean --force
ENV PATH /data/app/node_modules/.bin:$PATH

#Copy source code to app
WORKDIR /data/app
COPY . /data/app
#Move to /data to install akc-node-sdk
WORKDIR /data




EXPOSE 4500

CMD tail -f /dev/null
const { ApolloServer } = require("@apollo/server");
const { createServer } = require("http");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const { expressMiddleware } = require("@apollo/server/express4");
const bodyParser = require("body-parser");
const express = require("express");
const cors = require("cors");
const {
  ApolloServerPluginDrainHttpServer,
} = require("@apollo/server/plugin/drainHttpServer");

const { WebSocketServer } = require("ws");
const { useServer } = require("graphql-ws/lib/use/ws");
const { PubSub } = require("graphql-subscriptions");

const port = 4000;

const records_in_radius = "RECORDS_IN_RADIUS";

const pubSub = new PubSub();


const typeDefs = `
    type Address {
        location: String!
        latitude: Float!
        longitude: Float!
    }
    type CaseDetail {
        type: String!
        date: String!
    }
    type Record {
        firstName: String!
        lastName: String!
        middleName: String
        age: Int!
        dob: String!
        address: Address!
        caseDetail: CaseDetail!
    }
    type Query {
        getRecordsInRadius(latitude: Float!, longitude: Float!, radiusInMiles: Float!): [Record]
    }

    type Subscription {
        recordInRadius: [Record]!
    }
`;

const getHomicideRecordsAndPublish = async (latitude, longitude, radiusInMiles) => {
    try {
        const response = await fetch(`http://localhost:8080/homicide-records/records-in-radius?latitude=${latitude}&longitude=${longitude}&radiusInMiles=${radiusInMiles}`);
        const data = await response.json();
        pubSub.publish(records_in_radius, {
            recordInRadius: data});
    } catch (error) {
        console.error("Error fetching homicide:", error);
    }
}

const getTheftRecordsAndPublish = async (latitude, longitude, radiusInMiles) => {
    try {
        const response = await fetch(`http://localhost:8080/theft-records/records-in-radius?latitude=${latitude}&longitude=${longitude}&radiusInMiles=${radiusInMiles}`);
        const data = await response.json();
        pubSub.publish(records_in_radius, {
            recordInRadius: data});
    } catch (error) {
        console.error("Error fetching theft records:", error);
    }
}

const getAllRecordsInRadiusAndPublish = async (latitude, longitude, radiusInMiles) => {
    getHomicideRecordsAndPublish(latitude, longitude, radiusInMiles);
    getTheftRecordsAndPublish(latitude, longitude, radiusInMiles);
}

const resolvers = {
  Query: {
    getRecordsInRadius (parent, args, context, info) {
        const { latitude, longitude, radiusInMiles } = args;
        getAllRecordsInRadiusAndPublish(latitude, longitude, radiusInMiles);
        return [];
    }
  },
  Subscription: {
    recordInRadius: {
        subscribe: () => pubSub.asyncIterator([records_in_radius]),
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();

app.use(cors());

const httpServer = createServer(app);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

const wsServerCleanup = useServer({ schema }, wsServer);

const apolloServer = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),

    {
      async serverWillStart() {
        return {
          async drainServer() {
            await wsServerCleanup.dispose();
          },
        };
      },
    },
  ],
});

(async function () {
  await apolloServer.start();
  app.use("/graphql", bodyParser.json(), expressMiddleware(apolloServer));
})();

httpServer.listen(port, () => {
  console.log(`🚀 Query endpoint ready at http://localhost:${port}/graphql`);
  console.log(
    `🚀 Subscription endpoint ready at ws://localhost:${port}/graphql`
  );
});
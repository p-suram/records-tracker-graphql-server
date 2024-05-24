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

//define port for the graphql Server
const port = 4000;

// storing blogs in local
const blogs = [];

// event that the frontend will subscribe to
const blogs_created = "NEW_BLOG_CREATED";
const give_greeting = "GIVE_GREETING";

// setting up publish/subscriber
const pubSub = new PubSub();

/**
 * Function to push new blog event
 * @param {*} content , content of the blog
 * @param {*} author , author of the bog
 * @param {*} id , id of the blog
 */
const publishNewBlogAdded = (content, author, id) => {
  pubSub.publish(blogs_created, {
    newBlog: { content, author, id },
  });
};

// Function to fetch greeting from external API and publish it
const fetchAndPublishGreeting = async () => {
    try {
        console.log("making greeting api");
      const response = await fetch("http://localhost:8080/greeting");
      const data = await response.json();
      console.log("response from api", data);
      pubSub.publish(give_greeting, {
        greeting: {
            message: data.message
        }});
    } catch (error) {
      console.error("Error fetching greeting:", error);
    }
  };

  const fetchAndPublishWishes = async () => {
    try {
        console.log("making wishes api");
      const response = await fetch("http://localhost:8080/wishes");
      const data = await response.json();
      console.log("response from wishes api", data);
      pubSub.publish(give_greeting, {
        greeting: {
            message: data.message
        }});
    } catch (error) {
      console.error("Error fetching wishes:", error);
    }
  };

// schema defination for our grapql server
const typeDefs = `
    type Blog {
        id: ID!
        content: String!
        author: String!
    }

    type Greeting {
        message: String!
    }

    type Query {
        getBlogs: [Blog!]
        getGreeting: Greeting
        getWishes: Greeting
    }

    type Mutation {
        addNewBlog(content: String!, author: String!): Blog!
    }

    type Subscription {
        newBlog: Blog!
        greeting: Greeting!
    }
`;

// resolver handles all the incoming request to this server
const resolvers = {
  // registering a mutation
  Mutation: {
    // add new blog mutation to create new blog
    addNewBlog(_, { content, author }) {
      const blog = {
        id: blogs.length + 1,
        content,
        author,
      };
      // storing blog in the local blogs array
      blogs.push(blog);

      // once a blog is being created, we need to push the event so that frontend can catch it
      publishNewBlogAdded(content, author, blog.id);
      return blog;
    },
  },
  // registering Qyery
  Query: {
    getBlogs() {
      // return all blogs
      return blogs;
    },
    getGreeting () {
        fetchAndPublishGreeting();
        return null;
    },
    getWishes () {
        fetchAndPublishWishes();
        return null;
    }
  },
  // setting up subscription
  Subscription: {
    // newBlog subscription
    newBlog: {
      subscribe: () => pubSub.asyncIterator([blogs_created]),
    },
    greeting: {
        subscribe: () => pubSub.asyncIterator([give_greeting]),
      },
    //   wishes: {
    //     subscribe: () => pubSub.asyncIterator([give_greeting])
    //   }
  },
};

// registering our type definations and resolver for schema that we need to
// use for creating our apollo server
const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();

// for cross origin
app.use(cors());

// creating server instance
const httpServer = createServer(app);

// initializing websocket server
// as subscriptions make use of websockets to communicate
const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

const wsServerCleanup = useServer({ schema }, wsServer);

// creating apollo server with schema and server instance
const apolloServer = new ApolloServer({
  schema,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),

    // Proper shutdown for the WebSocket server.
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
  // starting the apollo server to expose endoint to client
  await apolloServer.start();
  app.use("/graphql", bodyParser.json(), expressMiddleware(apolloServer));
})();

httpServer.listen(port, () => {
  console.log(`🚀 Query endpoint ready at http://localhost:${port}/graphql`);
  console.log(
    `🚀 Subscription endpoint ready at ws://localhost:${port}/graphql`
  );
});
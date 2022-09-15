const path = require("path");
const webpack = require("webpack");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const ESLintPlugin = require("eslint-webpack-plugin");
const Dotenv = require("dotenv-webpack");

let isDevelopment = process.env.NODE_ENV !== "production";
let isProduction = process.env.NODE_ENV === "production";
let isESLINT = process.env.ESLINT === "true";

let entry = { main: "./src/index.tsx" };

const plugins = [
  new CleanWebpackPlugin(),
  new MiniCssExtractPlugin(),
  new HtmlWebpackPlugin({
    template: "./public/index.html",
  }),
  new webpack.ProvidePlugin({
    Buffer: ["buffer", "Buffer"],
  }),
  new webpack.ProvidePlugin({
    process: "process/browser.js",
  }),
  new Dotenv(),
  isESLINT && new ESLintPlugin(),
].filter(Boolean);

if (isDevelopment) {
  plugins.push(new ReactRefreshWebpackPlugin());
}

module.exports = {
  mode: isDevelopment ? "development" : "production",

  entry,

  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
    assetModuleFilename: "images/[hash][ext][query]",
    publicPath: "/",
  },

  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          isDevelopment && require.resolve("style-loader"),
          isProduction && {
            loader: MiniCssExtractPlugin.loader,
            options: { publicPath: "" },
          },
          {
            loader: require.resolve("css-loader"),
            options: {
              importLoaders: 1,
              sourceMap: isDevelopment,
            },
          },
        ].filter(Boolean),
        sideEffects: true,
      },
      {
        test: /\.(png|jpe?g|gif|svg|webp|ttf)$/i,
        type: "asset",
      },
      // {
      //   test: /\.(ttf)$/,
      //   use: [
      //     {
      //       loader: "file-loader",
      //       options: {
      //         name: "[name].[ext]",
      //         outputPath: "fonts/",
      //       },
      //     },
      //   ],
      // },
      {
        test: /\.(j|t)sx?$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            plugins: [
              isDevelopment && require.resolve("react-refresh/babel"),
            ].filter(Boolean),
          },
        },
      },
    ],
  },

  plugins,

  resolve: {
    fallback: {
      http: require.resolve("stream-http"),
      crypto: require.resolve("crypto-browserify"),
      https: require.resolve("https-browserify"),
      os: require.resolve("os-browserify"),
      buffer: require.resolve("buffer"),
      stream: require.resolve("stream-browserify"),
    },
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  },

  // devtool: isDevelopment ? "source-map" : false,
  devtool: false,

  devServer: {
    historyApiFallback: true,
    client: {
      logging: "error",
      overlay: { errors: true, warnings: false },
      progress: true,
      reconnect: 0,
    },
    open: true,
    port: 3001,
    hot: true, // not necessary in the latest version of webpack by default true
  },
};

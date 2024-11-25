const express = require("express");
const cors = require("cors");
const qs = require("qs");
const axios = require("axios");
const bodyParser = require("body-parser");
var createError = require("http-errors");
const { swaggerUi, specs } = require("./swagger/swagger");
const { makeToken } = require("./jwt.js");
const { callChatGPT } = require("./chatgpt");
const port = 8080;

const {
  OAUTH_GET_TOKEN_URL,
  OAUTH_GET_USERINFO_URL,
  OAUTH_CLIENT_SECRET,
  OAUTH_CLIENT_ID,
} = require("./constants.js");

const app = express();
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// Swagger
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(specs));

// DB setting
var maria = require("./config/maria");
maria.connect();

var allowlist = ["http://localhost:3000", "http://localhost:3001"];

app.use((req, res, next) => {
  console.log("\t");
  console.log("====================== NEW REQ START =====================");
  console.log("Received request:", req.method, req.url);
  next();
});

app.use(
  cors((req, callback) => {
    const origin = req.header("Origin");
    // console.log("CORS Origin Check:", origin);
    const corsOptions = allowlist.includes(origin)
      ? { origin: true }
      : { origin: false };
    callback(null, corsOptions);
  })
);

//body-parser 모듈을 불러온다.
app.use(bodyParser.json()); //요청 본문을 json 형태로 파싱
app.use(bodyParser.urlencoded({ extended: false })); //

/**
 * @swagger
 * tags:
 *   name: API
 *   description:
 */

/**
 * @path {GET} http://localhost:3000/
 * @description 요청 데이터 값이 없고 반환 값이 있는 GET Method
 */
app.get("/", (req, res) => {
  res.send("Hello World!");
});

/**
 * @swagger
 *  /messages:
 *    get:
 *      tags: [API]
 *      summary: "받은 편지 조회"
 *      description: "특정 사용자(name)의 이름으로 온 편지를 조회합니다."
 *      produces:
 *      - application/json
 *      parameters:
 *        - in: query
 *          name: name
 *          required: true
 *          schema:
 *            type: string
 *            description: "조회할 사용자 이름"
 *      responses:
 *       200:
 *        description: 제품 조회 성공
 *        schema:
 *          type: array
 *          items:
 *            type: object
 *            properties:
 *              _id:
 *                type: integer
 *                description: "메시지 ID"
 *              toName:
 *                type: string
 *                description: "받는 사람 이름"
 *              fromName:
 *                type: string
 *                description: "보내는 사람 이름"
 *              fromId:
 *                type: integer
 *                description: "보내는 사람 ID"
 *              message:
 *                type: string
 *                description: "편지 내용"
 *              type:
 *                type: string
 *                description: "편지 타입"
 *              date:
 *                type: string
 *                format: date-time
 *                description: "날짜 및 시간"
 *        examples:
 *          example1:
 *            summary: "편지 목록 예시"
 *            value:
 *              - _id: 1
 *                toName: "김기연"
 *                fromName: "홍길동"
 *                fromId: 0
 *                message: "안녕하세요 ㅎㅎ"
 *                type: ""
 *                date: "2024-11-08T07:56:44.000Z"
 *              - _id: 2
 *                toName: "김기연"
 *                fromName: "누구게"
 *                fromId: 0
 *                message: "hello"
 *                type: ""
 *                date: "2024-11-08T11:56:28.000Z"
 */
app.get("/messages", (req, res) => {
  try {
    let toName = req.query.name;
    maria.query(
      `SELECT * FROM Messages where toName="${toName}"`,
      function (err, result) {
        if (!err) {
          console.log("GET /messages - SELECT * FROM Messages");
          console.log("GET /messages - toName: " + toName);

          res.send(result);
        } else {
          console.log("ERR : " + err);
          res.status(404).json({
            error: err,
          });
        }
      }
    );
  } catch (err) {
    res.status(400).send("error : ", err);
  }
});

/**
 * @swagger
 * /messages:
 *   post:
 *     tags: [API]
 *     summary: "편지 전송"
 *     description: "특정 사용자(name)에게 편지를 전송합니다."
 *     produces:
 *     - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: "편지 전송을 위한 정보"
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - toName
 *             - fromName
 *             - message
 *           properties:
 *             toName:
 *               type: string
 *               description: "받는 사람 이름 (10자 이내)"
 *             fromName:
 *               type: string
 *               description: "보내는 사람 이름 (10자 이내)"
 *             message:
 *               type: string
 *               description: "보낼 편지 내용 (2000자 이내)"
 *             type:
 *               type: string
 *               description: "편지 배경색, 폰트 설정 등의 기능으로 자유롭게 이용! (선택 입력)"
 *     responses:
 *       200:
 *         description: "편지 전송 성공"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   description: "전송 성공 여부"
 *                 message:
 *                   type: string
 *                   example: "전송 완료!"
 */

app.post("/messages", (req, res) => {
  try {
    let toName = req.body.toName;
    let fromName = req.body.fromName;
    let message = req.body.message;
    let type = req.body.type ?? "";

    maria.query(
      `INSERT INTO Messages(toName, fromName, message, type) values ('${toName}','${fromName}','${message}','${type}')`,
      function (err, result) {
        if (!err) {
          console.log(
            `POST /messages - INSERT INTO Messages(toName, fromName, message, type) values ('${toName}','${fromName}','${message}','${type}`
          );

          res.send("전송 완료!");
        } else {
          console.log("ERR : " + err);
          res.status(404).json({
            error: err,
          });
        }
      }
    );
  } catch (err) {
    console.log(err);
    res.status(400).send("error : ", err);
  }
});

app.post("/gpt/generate/trip", async (req, res) => {
  // query params: step = "summary" | "details"
  const step = req.body.step;

  const userInput = req.body.userPrompt;
  const response = await callChatGPT({ userInput, gptStep: step });

  if (response) {
    res.json({ response: response });
  } else {
    res.status(500).json({ error: "Failed to get response from ChatGPT API" });
  }
});

/**
 * @swagger
 *  /oauth/callback:
 *    get:
 *      tags: [API]
 *      summary: "구글 OAuth 로그인"
 *      description: "구글 소셜 로그인을 통해 AccessToken을 발급합니다."
 *      produces:
 *      - application/json
 *      parameters:
 *        - in: query
 *          code: 쿼리 파라미터값으로 받은 authorization_code
 *          required: true
 *          schema:
 *            type: string
 *            description: " 쿼리 파라미터값으로 받은 authorization_code"
 *      responses:
 *       200:
 *        description: 구글 소셜 로그인 성공
 *        schema:
 *          type: array
 *          items:
 *            type: object
 *            properties:
 *              access_token:
 *                type: string
 *                description: "쿠키에 저장 할 AccessToken 값"
 *              name:
 *                type: string
 *                description: "로그인 한 사용자 이름"
 */
app.get("/oauth/callback", async (req, res) => {
  // OAuth Provider = kakao | naver | google
  let oauthProvider = req.query?.provider ?? "google";
  console.log(`==== OAUTH LOGIN , Provider: ${oauthProvider} ====`);

  // 1. Authorization Code로 naver 서비스 AccessToken 획독
  let token;
  try {
    const url = OAUTH_GET_TOKEN_URL[oauthProvider];
    const body = qs.stringify({
      grant_type: "authorization_code",
      client_id: OAUTH_CLIENT_ID[oauthProvider],
      client_secret: OAUTH_CLIENT_SECRET[oauthProvider],
      redirectUri: `http://localhost:3000/oauth/callback/${oauthProvider}`,
      code: req.query.code, // 프론트로부터 받은 Authorization Code
      state: null, // state는 네이버만
    });
    const header = { "content-type": "application/x-www-form-urlencoded" };
    const response = await axios.post(url, body, header);
    token = response.data.access_token;
  } catch (err) {
    console.log(err);
    console.log("ERR: Error while getting Authorization Code");
    res.status(400).send("ERR: Error while getting Authorization Code");
  }
  console.log("token", token);

  // 2. AccessToken으로 naver 유저 정보 획득
  let oauthUserInfoRes;
  try {
    const url = OAUTH_GET_USERINFO_URL[oauthProvider];
    const Header = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    const response = await axios.get(url, Header);

    console.log(response?.data);

    const name = response?.data.data.name;
    const accessToken = makeToken({ name });

    res.status(200).send({ access_token: accessToken, name });

    // if (oauthProvider === "naver") {
    //   oauthUserInfoRes = response?.data?.response;
    //   console.log("== NAVER User Info Response == ", response?.data?.response);
    // } else {
    //   oauthUserInfoRes = response?.data?.properties;
    //   console.log(
    //     "== KAKAO == User Info Response ==",
    //     response?.data?.properties
    //   );
    // }
  } catch (err) {
    console.log(err);
    console.log("ERR: Error while getting User Info");
  }
  // const { name, email, profile_image: img } = oauthUserInfoRes; => 네이버
  // const { nickname: name, profile_image: img } = oauthUserInfoRes; => 카카오
});

app.use(function (req, res, next) {
  next(createError(404));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

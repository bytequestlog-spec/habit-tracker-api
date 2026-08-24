const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

const app = express();
app.use(
  cors({
    origin: [
      "https://habittracker-six-rho.vercel.app",
      "http://localhost:5173",
    ],
  }),
);
app.use(express.json());

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// test route
app.get("/", (req, res) => {
  res.json({ message: "Habit Tracker API is running!" });
});

//get all habits
app.get("/habits", authMiddleware, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM habits WHERE user_id = $1 ORDER BY id ASC",
    [req.userId],
  );
  const habits = result.rows.map((habit) => ({
    ...habit,
    start_date: habit.start_date?.toISOString().split("T")[0],
    end_date: habit.end_date?.toISOString().split("T")[0],
  }));
  res.json(habits);
});

//post new habit
app.post("/habits", authMiddleware, async (req, res) => {
  const { name, days, start_date, end_date } = req.body;

  const result = await pool.query(
    "INSERT INTO habits (name, days, start_date, end_date, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [name, days, start_date, end_date, req.userId],
  );
  const habit = result.rows[0];

  res.json({
    ...habit,
    start_date: habit.start_date?.toISOString().split("T")[0],
    end_date: habit.end_date?.toISOString().split("T")[0],
  });
});

app.put("/habits/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, days, start_date, end_date, streak, completed_dates } =
    req.body;

  try {
    const result = await pool.query(
      "UPDATE habits SET name=$1, days=$2, start_date=$3, end_date=$4, streak=$5, completed_dates=$6 WHERE id=$7 AND user_id=$8 RETURNING *",
      [
        name,
        days,
        start_date,
        end_date,
        streak,
        JSON.stringify(completed_dates),
        id,
        req.userId,
      ],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "habit not found" });
    }
    const habit = result.rows[0];

    res.json({
      ...habit,
      start_date: habit.start_date?.toISOString().split("T")[0],
      end_date: habit.end_date?.toISOString().split("T")[0],
    });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/habits/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM habits WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Habit not found" });
    }

    res.json({ message: "Habit deleted" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
      [email, hashedPassword],
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    if ((err.code = "23505")) {
      res.status(400).json({ error: "Email already exists" });
    } else {
      res.status(500).json({ error: "Something went wrong" });
    }
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: "User not found " });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  console.log("UNMATCHED:", req.method, req.url);
  res.status(404).json({
    method: req.method,
    url: req.url,
    message: "Route not found",
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

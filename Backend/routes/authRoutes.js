const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const router = express.Router();

const userAccountModel = require("../Model/account");
const verifyToken = require("../Middleware/verifyToken");

// In-memory simulation database
const inMemoryUsers = [];

const findUserByEmail = async (email) => {
    if (mongoose.connection.readyState === 1) {
        try {
            return await userAccountModel.findOne({ email });
        } catch (err) {
            console.error("Mongoose query error, falling back to in-memory:", err);
        }
    }
    return inMemoryUsers.find(u => u.email === email);
};

const createUser = async (userData) => {
    if (mongoose.connection.readyState === 1) {
        try {
            return await userAccountModel.create(userData);
        } catch (err) {
            console.error("Mongoose creation error, falling back to in-memory:", err);
        }
    }
    const newUser = {
        _id: "mock-id-" + Math.random().toString(36).substring(2, 9),
        ...userData
    };
    inMemoryUsers.push(newUser);
    return newUser;
};

// ================= SIGNUP =================
router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await createUser({
            name,
            email,
            password: hashedPassword
        });

        return res.status(201).json({
            message: "User created successfully",
            userId: user._id
        });

    } catch (err) {
        return res.status(500).json({
            message: "Signup failed",
            error: err.message
        });
    }
});

// ================= LOGIN =================
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(404).json({ message: "No user found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Password is incorrect" });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ message: "JWT_SECRET not defined in .env" });
        }

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

       return res.status(200).json({
            message: "Success",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);
        return res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
});

module.exports = router;
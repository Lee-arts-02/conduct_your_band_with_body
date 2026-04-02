# Conduct Your Band 🎶

An interactive browser-based experience where users “conduct” a live band using body movements.

Link: https://lee-arts-02.github.io/conduct_your_band_with_body/

## Demo

[![Watch the demo](https://vumbnail.com/1179434815.jpg)](https://vimeo.com/1179434815)
A short demo showing gesture-based conducting interaction using pose detection and real-time music control.

## Overview
This project combines **MediaPipe Pose Detection** and **Tone.js** to transform human gestures into real-time music. Instead of pressing buttons, users control musical intensity, melody, and rhythm through expressive motion.

Designed as a **conference ice-breaking activity**, it is playful, intuitive, and accessible to first-time users.

## Features
- 🎥 Webcam-based pose detection (upper body)
- 🎼 Real-time music control using Tone.js
- 🎹 Gesture-driven melody and rhythm layers
- 🎲 Randomized musical phrases for variation
- 🎚️ Continuous intensity control based on hand height
- 👋 Waving gestures trigger dynamic musical changes

## Controls
- Click **Start** to enable camera and audio
- Raise hands → increase intensity
- Lower hands → soften music
- Left hand → melody control
- Right hand → rhythm control
- Wave hands → trigger musical variations

## Tech Stack
- MediaPipe Pose Landmarker (Web)
- Tone.js (Web Audio)
- JavaScript / HTML / CSS

## Run Locally
```bash
npx serve .

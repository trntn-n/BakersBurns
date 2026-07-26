"use strict";

require("dotenv").config();

const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

const encryptionKey = Buffer.from(
  process.env.ENCRYPTION_KEY || "",
  "hex"
);

if (encryptionKey.length !== 32) {
  throw new Error(
    "ENCRYPTION_KEY must be exactly 32 bytes represented as 64 hexadecimal characters."
  );
}

const encryptAddress = (address) => {
  if (!address) {
    return null;
  }

  const serializedAddress =
    typeof address === "string"
      ? address
      : JSON.stringify(address);

  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    encryptionKey,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(serializedAddress, "utf8"),
    cipher.final(),
  ]);

  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};

const decryptAddress = (encryptedValue) => {
  if (!encryptedValue) {
    return null;
  }

  if (typeof encryptedValue !== "string") {
    // It may already be decrypted.
    return encryptedValue;
  }

  const parts = encryptedValue.split(":");

  /*
   * A decrypted address or legacy plaintext address should not
   * be passed through the decipher again.
   */
  if (parts.length !== 2) {
    return parseAddress(encryptedValue);
  }

  const [ivHex, encryptedHex] = parts;

  if (
    !/^[a-f\d]{32}$/i.test(ivHex) ||
    !/^[a-f\d]+$/i.test(encryptedHex) ||
    encryptedHex.length % 2 !== 0
  ) {
    return parseAddress(encryptedValue);
  }

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey,
    iv
  );

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");

  return parseAddress(decrypted);
};

const parseAddress = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

module.exports = {
  encryptAddress,
  decryptAddress,
};
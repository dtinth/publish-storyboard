import { s3 } from "bun";

const url = s3.presign("hello.txt", { method: "PUT", expiresIn: 3600 });
console.log("Presigned URL:", url);

const response = await fetch(url, {
  method: "PUT",
  body: "It works!",
  headers: { "Content-Type": "text/plain" },
});

console.log("Status:", response.status, response.statusText);

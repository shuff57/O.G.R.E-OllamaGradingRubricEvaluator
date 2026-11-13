# ogre-examples

Grades a teacher approved, kept so that the AI grader can be shown how the same question was scored before.

OGRE keeps nothing unless the teacher turns it on, in Settings under "Your earlier grades". There are two places to keep them: on the computer OGRE runs on, or on a server of the teacher's own.

## What is kept

One line per approved grade:

| Field | What it is |
|---|---|
| `score`, `max_score` | The score that was written to the site, and what it is out of |
| `feedback` | The feedback as text, cut to 1000 characters, with the student's name taken out |
| `changed` | Whether the teacher changed the score the AI proposed |
| `at` | When it was approved |

No student's name, id or answer is kept. Two limits to know about:

- Feedback can quote a few of a student's words.
- A name is taken out where it appears as the page gives it. A nickname the AI made up would stay.

Examples are filed under a hash of the question and its maximum score, so the same question finds its examples again in another class or another year, and a reworded rubric still finds them. A zero given for no response is not kept. At most 200 examples are kept per question; older ones make way.

When a question is graded, OGRE looks at the 12 most recent examples for it, taking first those where the teacher changed the AI's score, and shows the grader the highest, the middle and the lowest.

## On this computer

Nothing to set up. The examples go in `examples/` in OGRE's data folder (`~/.local/share/ogre/examples` on Linux), readable by the owner only. Settings has buttons to count them and to delete them all.

## On a server

Use this to grade from the same examples on more than one computer. The server is a small program that keeps the same files in a folder of its own.

1. Build it on the server:

   ```sh
   cargo build --release -p ogre-examples --bin ogre-examples-server
   ```

2. Start it. The first start makes the key file, with a new key in it:

   ```sh
   ogre-examples-server --folder /var/lib/ogre-examples --key-file /etc/ogre-examples.key
   ```

   It listens on `127.0.0.1:8750` and speaks plain HTTP, so it must not be reached directly from other computers.

3. Put a web server that speaks HTTPS in front of it. With Caddy, which gets the certificate by itself:

   ```
   ogre.example.org {
       reverse_proxy 127.0.0.1:8750
   }
   ```

4. In OGRE's Settings choose "Keep them on a server of mine", enter `https://ogre.example.org` and the key from the key file, and press "Check the server".

OGRE refuses an `http://` address unless it is on the same computer, so the key and the feedback never cross a network in the clear. The key is kept in the operating system's keyring, not in a file.

Whoever holds the key can read, add to and delete the examples. There is one key and one set of examples per server: run one server for each teacher. Before putting student-related records on a server, check what your school or district allows.

### What the server answers

Every request carries `Authorization: Bearer <key>`.

| Request | Answer |
|---|---|
| `GET /v1/examples` | `{"examples": 12}`: how many are kept |
| `DELETE /v1/examples` | `{"deleted": 12}`: all of them are gone |
| `GET /v1/examples/<question>` | that question's examples, as a list |
| `POST /v1/examples/<question>` | keeps the list sent, at most 200 at once; `{"kept": 3}` |

## Tests

```sh
cargo test -p ogre-examples                  # the store, and the server over a real connection
cargo test -p ogre-app --test examples       # the app's worker with a folder and with a running server
```

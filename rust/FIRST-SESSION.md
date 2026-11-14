# A first grading session with OGRE

For one real MyOpenMath question, start to finish. Nothing reaches MyOpenMath until step 8, and
nothing is stored there until step 9.

Pick a question where a few students have no grade yet. OGRE then grades only those and leaves
every existing grade alone.

## Once, before the first session

1. Open **OGRE Grader** from the applications menu.
2. Go to **Settings**. The AI service is not set up yet in this copy. Press **Copy from the old
   OGRE app**, which brings over the service, the model and the key. Press **List models** to see
   that the service answers.

Student names and answers are sent to that service for grading, as with the old app.

## The session

3. Go to **Grade** and press **Start Chrome**. A separate Chrome window opens. It is OGRE's own,
   and it is already signed in to MyOpenMath. If it asks you to sign in, do so there once.
4. In that Chrome window, go to the question's "Grade all" page. Or paste its address into the
   box in OGRE and press **Open**.
5. Press **Read students**. OGRE lists the students and shows the rubric it read from the page
   in the **Rubric** card. Look the rubric over: it is what the AI grades against.
6. **Who to grade** says "Students with no grade yet". Leave it there. Press
   **Grade N students**. About a minute for a class. **Stop** ends the run once the AI has
   answered what it was last asked.
7. Review. Each student has a proposed score and feedback. Open a row to read the answer beside
   the feedback. You can change a score, change the feedback, or untick **Write this one** to
   leave that student out. Where the consistency check suggests another score, it says so, and
   **Use the suggestion** takes it. Nothing is applied unless you take it.
8. Press **Fill in N grades**. OGRE types the grades into the page's form and reads each one
   back to check it. Look at the Chrome window: the scores and feedback are in the boxes, and
   nothing is saved yet.
9. Press **Save on MyOpenMath**. OGRE saves and waits for the site to say it worked.

## What cannot happen by accident

- A score that already has points is not changed unless you tick **Replace scores that already
  have points**.
- Existing feedback is not replaced unless you tick **Replace existing feedback**.
- Closing Chrome or OGRE before step 9 leaves MyOpenMath as it was.

## If something goes wrong

OGRE says what happened in a line on the Grade screen. Copy that line, and say which step you
were on. Each session is recorded in `~/.local/share/ogre/sessions`, without the students'
answers, so what OGRE read, proposed and wrote can be looked up afterwards.

A run that was graded and not written is offered again the next time the same page is read.

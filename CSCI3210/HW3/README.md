The code for all of this can be found at https://github.com/nathanielgreisen/nathanielgreisen.github.io/tree/main/CSCI3210/HW3.

The actual game itself can be played on my website at https://nathanielgreisen.github.io/CSCI3210/HW3/public/.

Added functions:
 1: Improved Snake movement
    - I thought the movement felt blocky, so I added a type of queue where
    - if the user pressed two arrow keys quickly, it would add the second
    - one to the queue, and would then happen on the next frame. This
    - made movement feel much smoother. The snake also can no longer
    - reverse directions and pass through itself.
 2: Game Settings menu
    - I added a settings menu that allows the user to change the size of the
    - game and the amount of fruit on it. The user can also choose to play
    - singleplayer or multiplayer, and can choose their snake color.
 3: Fruit generation
    - Users can change how many fruit on the field, calculated by size of the field
 4: Game size
    - Users can change the size of the game field
 5: Multiplayer
    - This was largely stolen from my last homework, using the same PeerJS library.
    - It works as a host and a guest, and they connect directly to each other to play.
    - If they collide, the game ends and they can rematch

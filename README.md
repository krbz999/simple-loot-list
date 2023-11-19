Interested in following along with development of any of my modules? Join the [Discord server](https://discord.gg/QAG8eWABGT). 

# Simple Loot List

This module adds a secondary inventory list on an actor, where a GM can place loot. Simply open the interface and drag items in. The GM can find the button in the header of any actor.

<img src="https://i.imgur.com/dt98HA1.png" style="text-align: center;">

The list will initially be empty. Simply drag items into the drop area and they will populate the list below.

<img src="https://i.imgur.com/jPPQXIM.png" style="text-align: center;">
<img src="https://i.imgur.com/LAZE0Gf.png" style="text-align: center;">

Under Quantity, you can specify how many items of that kind are present. If you drag the same item onto the list, the quantity will automatically increase by 1. This supports dice rolls, and those dice rolls support actor roll data if needed.

At the bottom are four buttons:
- Save List: to save the list on the actor. The list is not automatically saved when you drag in an item.
- Clear: to clear all items from the list. Remember to hit Save List afterwards.
- Grant to Target: grants all the items to the user's target (press T when hovering over a token to target them). This will grant all the items to the target, rolling the quantity, and populating roll formulas with the target's roll data if necessary.
- Cancel: closes the list without saving.

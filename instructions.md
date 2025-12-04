

# Optimizations 

As more planets are added performance slows really bad and simulation times get really long.

Steps
1. Identify bottlenecks in the code for simulations
 - Check if music generation or trajectory calculations are taking longer
 - See if too much info is being sent back to the frontend
 - See if the velocity envelopes are too big and instead we could send smaller key points and have the frontend interpolate
 - Looks for other inefficiencies in the code
2. Write a markdown file with all the identified bottlenecks and possible solutions and detailed steps to implement them
3. Request approval for the changes
4. Implement the changes


# Backend Refactoring

- The music.py module has grown too large and must be split into a package
- Have a module for the stat generation of the planets where it runs through each
planet and generates the needed stats like eccentricity, etc... 
- Improve optimizations such that only the neccessary information is sent depending on the request
- For example, a trajectory-only sim should not send back any audio event data

# Frontend improvements

- Add a throbber when waiting for a simulatio to complete to help offset the long loading times
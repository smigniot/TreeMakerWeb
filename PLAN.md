# TreeMakerWeb

The goal of this project is to port the famous Origami software TreeMaker, from Robert J Lang, to the browser.

## Original Software Description

The software is a Graphical User Interface for designing Origami Crease Patterns based on the Circle-River-Packing algorithm.

## Original Software Sources

* The reference url is https://langorigami.com/article/treemaker/
* The github repository is at https://github.com/bugfolder/treemaker

## Work plan

* Collect as many raw material as needed in an "Orig" sub-folder, in particular copy the original source code
* Analyse it to extract algorithms and independant code blocks in the software
* Continue Analysis to isolate graphical interactions, thus having a set of UI and Back-end components 
* Propose a port implementation, asking as many questions as you need
    * UI is browser-rendered and may make cut on some edge-case features. 
    * Back-end components could be compiled in WebAssembly and used through Service Workers
* At this plan/design time, plan for frequent manual and automated tests, for instance using playwright and end-user manual testing
    * The goal of testing is to reduce the risk of misunderstanding or failure, and being able to rollback and continue on another "conception" proposal
* At the end of this analysis phase, write a DESIGN.md file here
* Maintainability _for you, Claude_ is a valuable plus. Maintainability by humans is a nice to have but not mandatory.
* Wait for the go for implementation
* Finally, as the implementation may take several days/sessions, you should write a HISTORY.md file frequently to be able to stop and restart without context at any time (typically after a one hour session)


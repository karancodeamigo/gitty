const { parse } = require('dotenv');
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


function calculateAllPositions(diffText, targetFilePath) {
    const lines = diffText.split('\n');
    let currentFilePath = '';
    let inTargetFile = false;
    let globalPosition = 0;  // Global position counter across the entire diff for the file
    let lineNumber = 0;  // File-specific line number for added lines
    let positions = [];  // Store positions of all added lines

    for (let line of lines) {
        // console.log("**" + line + "**")
        if (line.startsWith('diff --git')) {
            // Check if this is the start of the target file section
            inTargetFile = line.includes(`a/${targetFilePath} b/${targetFilePath}`);
            if (!inTargetFile && currentFilePath === targetFilePath) break;  // Stop if exiting target file section
            currentFilePath = inTargetFile ? targetFilePath : '';
        }

        if (inTargetFile) {
            if (line.startsWith('@@')) {
                // Extract line numbers from the diff hunk header
                const matches = /@@ -\d+,\d+ \+(\d+),\d+ @@/.exec(line);
                lineNumber = matches ? parseInt(matches[1]) - 1 : 0;  // Reset line number at each new hunk
            } else if (!line.startsWith('-')) {
                // Count position only for context and addition lines within the target file
                lineNumber++;
            }
            // console.log("lineNumber:" + lineNumber)
            globalPosition++;  // Always increment position within the target file section
            // console.log("globalPosition:" + globalPosition)
            // If it's an addition line, store the position
            if (line.startsWith('+')) {
                positions.push({ lineNumber: lineNumber, position: globalPosition });
            }
        } else {
            // Increment global position outside the target file to keep an accurate count
            globalPosition++;
            // console.log("globalPosition:" + globalPosition)
        }
    }
    return positions;  // Return all positions for added lines
}

function extractValidJson(outputString) {
    // Define the JSON code block start indicator
    const jsonStartIndicator = '```json';

    // Check if the output starts with the jsonStartIndicator
    let jsonString = outputString
    if (outputString.startsWith(jsonStartIndicator)) {
        // Remove the jsonStartIndicator and the trailing code block (```)
        let startIndex = outputString.indexOf(jsonStartIndicator) + jsonStartIndicator.length;
        let endIndex = outputString.lastIndexOf('```');

        // Extract the JSON string
        jsonString = outputString.substring(startIndex, endIndex);
        // console.log("stripped ```json")
    } else if (!outputString.startsWith("[")) {
        jsonString = "[" + outputString + "]"
    }
    try {
        // Parse the JSON string to ensure it's valid
        let jsonData = JSON.parse(jsonString.trim());
        return jsonData;
    } catch (error) {
        console.log(jsonString)
        console.error("Failed to parse JSON:", error);
    }
    return null; // Return null if not valid JSON or the correct format
}

function splitChunksIntoGroups(chunks, maxChars = 16000) {
    const groups = [];
    let currentGroup = [];
    let currentLength = 0;

    chunks.forEach(chunk => {
        const chunkJson = JSON.stringify(chunk);
        const chunkLength = chunkJson.length + 1; // +1 for comma or closing bracket

        if (currentLength + chunkLength > maxChars) {
            groups.push(currentGroup);
            currentGroup = [chunk];
            currentLength = chunkLength;
        } else {
            currentGroup.push(chunk);
            currentLength += chunkLength;
        }
    });

    // Add the last group if it has any chunks
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}

function parseGitDiff(diff) {
    const lines = diff.split('\n');
    let currentLineNumber = 0;
    let oldLineNumber = 0;
    let currentFilePath = '';
    const parsedChanges = [];
    let currentChange = null;

    for (let line of lines) {
        if (line.startsWith('diff --git')) {
            if (currentChange) {
                parsedChanges.push(currentChange);
                currentChange = null;
            }
            const filePaths = line.match(/b\/(.+)$/); // Assuming 'b/' prefix for new file paths
            currentFilePath = filePaths ? filePaths[1] : '';
            continue;
        }

        if (line.match(/^\@\@ \-(\d+),\d+ \+(\d+),\d+ \@\@/)) {
            if (currentChange) {
                parsedChanges.push(currentChange);
                currentChange = null;
            }
            const match = line.match(/^\@\@ \-(\d+),\d+ \+(\d+),\d+ \@\@/);
            oldLineNumber = parseInt(match[1], 10) - 1;
            currentLineNumber = parseInt(match[2], 10) - 1;
            continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
            if (!currentChange || currentChange.type !== 'add') {
                if (currentChange) {
                    parsedChanges.push(currentChange);
                }
                currentChange = { type: 'add', file: currentFilePath, lines: { start: currentLineNumber, end: currentLineNumber }, content: [] };
            }
            currentChange.content.push(line.substring(1));
            currentChange.lines.end = currentLineNumber;
            currentLineNumber++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            if (!currentChange || currentChange.type !== 'delete') {
                if (currentChange) {
                    parsedChanges.push(currentChange);
                }
                currentChange = { type: 'delete', file: currentFilePath, lines: { start: oldLineNumber, end: oldLineNumber }, content: [] };
            }
            currentChange.content.push(line.substring(1));
            currentChange.lines.end = oldLineNumber;
            oldLineNumber++;
        } else {
            if (currentChange) {
                parsedChanges.push(currentChange);
                currentChange = null;
            }
            oldLineNumber++;
            currentLineNumber++;
        }
    }

    if (currentChange) {
        parsedChanges.push(currentChange);
    }

    return parsedChanges;
}

async function generatePrTitle(diffChunk) {
    const chunks = splitDiffIntoFileSections(diffChunk, 16000); // Splits input into chunks of up to 16,000 tokens
    let aggregateResult = '';
    try {
        for (const chunk of chunks) {
            const chunkResponse = await openai.chat.completions.create({
                messages: [{
                    role: "system", content: `Provide an appropriate Pull request title for the following changes in less than 10-12 words: \n\n${chunk}`
                }],
                model: "gpt-3.5-turbo",
                temperature: 0.7
            });
            console.log("...")
            aggregateResult += chunkResponse.choices[0].message.content.trim() + '\n\n';
        }
        if (aggregateResult.length > 1) {
            const response = await openai.chat.completions.create({
                messages: [{
                    role: "system", content: `Summarize the following code changes in a title totalling less than 10 words: \n\n${aggregateResult}`
                }],
                model: "gpt-3.5-turbo",
                temperature: 0.7
            });
            return response.choices[0].message.content.trim() + '\n\n';
        } else return aggregateResult[0]
    } catch (error) {
        console.error('Error while generating description:', error);
        return "Error generating description.";
    }

}

async function generateReviewComments(diffChunk) {
    chunks = splitDiffIntoFileSections(diffChunk)
    // console.log(diffs.length)
    // chunks = splitChunksIntoGroups(diffs);

    let comments = []
    console.log("chunks.length: " + chunks.length)
    try {
        for (const chunk of chunks) {
            // console.log("chunk" + chunk)
            const chunkResponse = await openai.chat.completions.create({
                messages: [{
                    role: "system",
                    content: `You are an expert GitHub reviewer proficient in reading and interpreting git diffs. Your task is to provide a detailed review of potential issues identified from a git diff. The review should focus on:
                    - Code smells: Patterns in the code that may indicate deeper problems.
                    - Maintainability issues: Changes that could complicate future modifications or upgrades.
                    - Best practices violations: Deviations from accepted coding standards and practices.
                    - Scalability concerns: Modifications that might affect the system's ability to scale.
                  
                    For each review comment, please calculate the line numbers accurately based on the diff hunk header. The line numbers should reflect the position in the new version of the file (after the changes). Use the format '+<line number>' found in the diff to determine where the added lines begin and how many lines are affected.
                  
                    Include:
                    - The filename.
                    - Specific line numbers of the change in the new version.
                    - A detailed explanation of the concern.
                    - Suggestions for improvement.
                  
                    Here is the segment of the diff:
                    ${chunk}
                  
                    Generate the review comments in the following JSON format:
                    [
                      {
                        'file_path': '/src/main/service/example_file.js',
                        "lines": {
                          "start": , //starting line number in the new file where changes begin
                          "end": , //ending line number in the new file where changes end
                        },
                        'comment': "" // detailed review comment encapsulating the identified issues and suggested improvements
                      }
                    ]
                  
                    Focus on providing actionable, specific, and technically relevant feedback. Assess if the change introduces any risks or problems and suggest how to rewrite the code where necessary.`
                }],
                model: "gpt-3.5-turbo",
                temperature: 0.7
            });
            console.log("...")
            comments = comments.concat(extractValidJson(chunkResponse.choices[0].message.content))
            // console.log("comments.length: " + comments.length)
        }
        return comments

    } catch (error) {
        console.error('Error while generating comments:', error);
        return "Error generating description.";
    }

}
/**
 * Generates a concise description of a given PR diff chunk.
 * @param {string} diffChunk - The chunk of PR diff text.
 * @returns {Promise<string>} - A promise that resolves to the generated description.
 */
async function generatePrDescription(diffChunk) {
    const chunks = splitDiffIntoFileSections(diffChunk, 16000); // Splits input into chunks of up to 16,000 tokens
    let aggregateResult = '';

    try {
        for (const chunk of chunks) {

            const chunkResponse = await openai.chat.completions.create({
                messages: [{
                    role: "system", content: `Summarize the following code changes in a concise manner: \n\n${chunk}`
                }],
                model: "gpt-3.5-turbo",
                max_tokens: 150,
                temperature: 0.7
            });
            console.log("...")
            aggregateResult += chunkResponse.choices[0].message.content.trim() + '\n\n';
        }
        if (aggregateResult.length > 1) {
            const response = await openai.chat.completions.create({
                messages: [{
                    role: "system", content: `Summarize the following code changes in a list totalling 50 - 200 words, and point based description to help the reviewers 
                get some context on the changes in markdown format: \n\n${aggregateResult}`
                }],
                model: "gpt-3.5-turbo",
                max_tokens: 150,
                temperature: 0.7
            });
            return response.choices[0].message.content.trim() + '\n\n';
        } else return aggregateResult[0]
    } catch (error) {
        console.error('Error while generating description:', error);
        return "Error generating description.";
    }

}

function processDiff(diffText) {
    const sectionPattern = /^(diff --git a\/(.+?) b\/(.+))/mg;
    const sections = [];
    let match;
    let lastIndex = 0;

    while ((match = sectionPattern.exec(diffText))) {
        if (lastIndex !== 0) {
            sections.push({
                content: diffText.substring(lastIndex, match.index),
                filePath: match[2] // Capture the file path from the regex group
            });
        }
        lastIndex = match.index;
    }

    if (lastIndex < diffText.length) {
        sections.push({
            content: diffText.substring(lastIndex),
            filePath: sections[sections.length - 1] ? sections[sections.length - 1].filePath : undefined // Handle the last section's file path
        });
    }

    return extractNewLinesFromSections(sections);
}

function extractNewLinesFromSections(sections) {
    return sections.map(section => {
        const lines = section.content.split('\n');
        let lineNumber = 0;
        const newLines = [];
        let currentHunkStart = 0; // Track the starting line number of the current hunk

        lines.forEach(line => {
            if (line.startsWith('@@')) {
                const match = /@@ -\d+,\d+ \+(\d+),\d+ @@/.exec(line);
                currentHunkStart = match ? parseInt(match[1], 10) - 1 : currentHunkStart;
                lineNumber = currentHunkStart; // Reset line number at the start of each hunk
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
                newLines.push({ line: lineNumber + 1, content: line.substring(1) }); // Capture the line number and content, removing the '+' prefix
                lineNumber++;
            } else if (!line.startsWith('-')) {
                lineNumber++; // Increment for context and other non-deletion lines
            }
        });

        return {
            filePath: section.filePath,
            additions: newLines
        };
    });
}


function splitDiffIntoFileSections(diffText) {
    const sectionPattern = /^(diff --git a\/(.+?) b\/(.+))/mg;
    const sections = [];
    let match;
    let lastIndex = 0;  // Keep track of the last index where a section was found

    // Iterate over each match to split the diffText based on the sectionPattern
    while ((match = sectionPattern.exec(diffText))) {
        if (lastIndex !== 0) {
            // Add the entire diff section for the previous file from lastIndex up to the current match's index
            sections.push(diffText.substring(lastIndex, match.index));
        }
        // Update lastIndex to the current match's index for the next iteration
        lastIndex = match.index;
    }

    // Add the last section if any remains after the final match
    if (lastIndex < diffText.length) {
        sections.push(diffText.substring(lastIndex, diffText.length));
    }

    return sections;
}


// function processChanges(content) {
//     const lines = content.split('\n');
//     const changeDetails = [];
//     let currentLineNumberA = 0;
//     let currentLineNumberB = 0;
//     let currentPosition = 0;  // Counter to track position within the diff hunk
//     let inHeader = true;

//     lines.forEach(line => {
//         if (line.startsWith('@@')) {
//             const lineNumberMatch = /@@ -(\d+),\d+ \+(\d+),\d+ @@/.exec(line);
//             if (lineNumberMatch) {
//                 currentLineNumberA = parseInt(lineNumberMatch[1]) - 1;
//                 currentLineNumberB = parseInt(lineNumberMatch[2]) - 1;
//             }
//             currentPosition = 0;  // Reset position counter at the start of each diff hunk
//             inHeader = false;
//         } else {
//             currentPosition++;  // Increment position for each line in the diff hunk
//             if (!inHeader) {
//                 if (line.startsWith('-')) {
//                     currentLineNumberA++;
//                 } else if (line.startsWith('+')) {
//                     currentLineNumberB++;
//                     changeDetails.push({ line: currentLineNumberB, type: 'add', content: line, position: currentPosition });
//                 } else if (line.startsWith(' ')) {
//                     currentLineNumberA++;
//                     currentLineNumberB++;
//                 }
//             }
//         }
//     });

//     return changeDetails;
// }




module.exports = { generatePrDescription, generateReviewComments, calculateAllPositions, generatePrTitle };

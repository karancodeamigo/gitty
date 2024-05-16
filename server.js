// // Assuming you are using CommonJS elsewhere in your application:
// require('dotenv').config();
// const fs = require('fs').promises; // Using the promises API for fs

// const express = require('express');
// const bodyParser = require('body-parser');
// const { Octokit } = require("@octokit/rest");
// const { generatePrDescription, updatePrDescription, generateReviewComments, calculateAllPositions } = require('./generateContent');

// const app = express();
// app.use(bodyParser.json());



// async function main() {
//     const auth = await setupGitHubApp();

//     app.post('/webhook', async (req, res) => {
//         const payload = req.body;

//         if (payload.action === 'created' && payload.issue && payload.issue.pull_request && payload.comment.body.includes('review-code')) {
//             const { repository, issue } = payload;
//             const owner = repository.owner.login;
//             const repoName = repository.name;
//             const issue_number = issue.number;

//             const installationAccessToken = await auth({
//                 type: "installation"
//             });
//             const octokit = new Octokit({ auth: installationAccessToken.token });

//             try {
//                 await octokit.rest.issues.createComment({
//                     owner: owner,
//                     repo: repoName,
//                     issue_number: issue_number,
//                     body: 'Starting to review. :)',
//                 });
//                 console.log(`Code review started for PR #${issue_number} in ${owner}/${repoName}`);
//             } catch (error) {
//                 console.error('Failed to create comment:', error);
//             }

//             latestCommitSha = await fetchCommitsFromPullRequest(octokit, owner, repoName, issue_number)
//             try {
//                 const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
//                     owner: owner,
//                     repo: repoName,
//                     pull_number: issue_number,
//                     headers: {
//                         accept: 'application/vnd.github.v3.diff'
//                     }
//                 });
//                 await fs.writeFile("output.txt", JSON.stringify(response.data, null, 2)); // 'null, 2' for pretty-printing
//                 console.log('Data has been written to file successfully.');
//                 // console.log(response.data)
//                 prComments = await generateReviewComments(response.data)
//                 await fs.writeFile(`comments-${getTimestamp()}.json`, JSON.stringify(prComments, null, 2)); // 'null, 2' for pretty-printing
//                 createConsolidatedReviewComment(octokit, owner, repoName, issue_number, latestCommitSha, prComments, response.data)
//             } catch (error) {
//                 console.error('Error getting pull request diff:', error);
//                 return null;
//             }
//             res.status(200).send('Webhook received');
//         }
//     });

//     const port = process.env.PORT || 3000;
//     app.listen(port, () => console.log(`Server listening on port ${port}`));
// }



// main().catch(console.error);

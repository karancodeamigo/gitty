const { createConsolidatedReviewComment, fetchCommitsFromPullRequest, updatePrDescription, updatePrTitle } = require('./github');
const { getTimestamp } = require('./utils');
const fs = require('fs').promises;
const { generateReviewComments, generatePrDescription, generatePrTitle } = require('./generateContent')

// Handles specific webhook events related to pull request reviews
async function handlePullRequestCommand(octokit, payload, auth) {
    const { repository, issue } = payload;
    const owner = repository.owner.login;
    const repoName = repository.name;
    const issue_number = issue.number;

    try {
        const latestCommitSha = await fetchCommitsFromPullRequest(octokit, owner, repoName, issue_number);
        const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
            owner: owner,
            repo: repoName,
            pull_number: issue_number,
            headers: { accept: 'application/vnd.github.v3.diff' }
        });
        if (payload.comment.body.includes('gitty review')) {
            const prComments = await generateReviewComments(response.data); // Assuming this function exists
            await createConsolidatedReviewComment(octokit, owner, repoName, issue_number, latestCommitSha, prComments, response.data);
        }

        else if (payload.comment.body.includes('gitty title')) {
            const description = await generatePrTitle(response.data); // Assuming this function exists
            await updatePrTitle(octokit, owner, repoName, issue_number, description);
        }

        else if (payload.comment.body.includes('gitty description')) {
            const description = await generatePrDescription(response.data); // Assuming this function exists
            await updatePrDescription(octokit, owner, repoName, issue_number, description);
        }
    } catch (error) {
        console.error('Error processing pull request review:', error);
    }
}

// General event dispatcher
async function handleWebhookEvent(octokit, payload) {
    if (payload.action === 'created' && payload.issue && payload.issue.pull_request) {
        addReactionToComment(octokit, payload, 'eyes')
        await handlePullRequestCommand(octokit, payload);
    }
}

async function addReactionToComment(octokit, payload, reaction) {
    try {
        // Using the Octokit plugin for reactions
        await octokit.rest.reactions.createForIssueComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            comment_id: payload.comment.id,
            content: reaction
        });
        // console.log(`Added "${reaction}" reaction to comment ID ${payload.comment.id}`);
    } catch (error) {
        console.error('Failed to add reaction to comment:', error);
    }
}

module.exports = {
    handleWebhookEvent
};

const fs = require('fs').promises;

async function setupGitHubApp() {
    const { createAppAuth } = await import('@octokit/auth-app');
    const auth = createAppAuth({
        appId: process.env.GITHUB_APP_ID,
        installationId: process.env.INSTALLATION_ID,
        privateKey: process.env.GITHUB_PRIVATE_KEY,
    });

    return auth;
}

async function postCommentToPullRequest(owner, repo, pullNumber, commitId, filePath, position, body) {
    try {
        const response = await octokit.rest.pulls.createReviewComment({
            owner,
            repo,
            pull_number: pullNumber,
            commit_id: commitId, // The SHA of the latest commit of the PR
            path: filePath,
            position: position, // The line index in the diff where you want to place the comment
            body: body
        });
        console.log('Comment posted successfully:', response.data.html_url);
    } catch (error) {
        console.error('Failed to post comment:', error);
    }
}

async function createReviewComments(octokit, owner, repo, pullNumber, commitId, comments, diffText) {
    await fs.writeFile("comments.json", JSON.stringify(comments)); // 'null, 2' for pretty-printing

    try {
        for (const comment of comments) {
            console.log("comment: " + JSON.stringify(comment))
            const positions = calculateAllPositions(diffText, comment.file_path);
            // console.log("positions" + JSON.stringify(positions))
            // let specificLinePosition = positions.find(p => p.lineNumber === comment.line_number).position;
            // if (specificLinePosition) {
            //     console.log("Position for line", comment.line_number, "is", specificLinePosition);
            // }

            request = {
                owner: owner,
                repo: repo,
                pull_number: pullNumber,
                commit_id: commitId,
                // subject_type: "file",
                path: comment.file_path,
                line: comment.lines.start,
                body: comment.comment
            }
            console.log("request: " + JSON.stringify(request))
            const response = await octokit.rest.pulls.createReviewComment(request);
        }
    } catch (error) {
        console.error('Failed to post comment:', error);
    }
}


async function createConsolidatedReviewComment(octokit, owner, repo, pullNumber, commitId, comments, diffText) {
    try {
        // Aggregate all comments into a single Markdown formatted string
        let markdownComment = "### Detailed Review Comments by Gitty\n\n";
        for (const comment of comments) {
            markdownComment += `**File**: \`${comment.file_path}\` **Lines**: \`${comment.lines.start}\` - \`${comment.lines.end}\`\n`;
            markdownComment += `**Change Requested**: ${comment.comment}\n\n`;
        }

        // Prepare the request object for GitHub API
        const request = {
            owner: owner,
            repo: repo,
            issue_number: pullNumber,
            body: markdownComment,  // Use the aggregated Markdown string
            // The following fields would typically be used if you're commenting on a specific line,
            // Since this is an overview, you might want to adjust how you handle position or omit it.
            // path: "General overview, see details in the comment body",
            // position: 1 // This needs correct handling based on your context
        };

        // Post the consolidated comment as a pull request review comment
        const response = await octokit.rest.issues.createComment(request);
        console.log('Comment posted successfully:', response.data.html_url);
    } catch (error) {
        console.error('Failed to post consolidated comment:', error);
    }
}



async function fetchCommitsFromPullRequest(octokit, owner, repo, pullNumber) {
    try {
        const response = await octokit.rest.pulls.listCommits({
            owner: owner,
            repo: repo,
            pull_number: pullNumber
        });

        // Assuming you want to get the SHA of the latest commit
        if (response.data.length > 0) {
            const latestCommitSha = response.data[response.data.length - 1].sha;
            console.log("Latest commit SHA:", latestCommitSha);
            return latestCommitSha; // You can use this SHA for other API calls
        } else {
            console.log("No commits found in this pull request.");
            return null;
        }
    } catch (error) {
        console.error('Error fetching commits:', error);
    }
}

async function updatePrTitle(octokit, owner, repo, pull_number, newTitle) {
    try {
        const response = await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number,
            title: newTitle  // Specify the new title here
        });
        console.log('PR title updated:', response.data.html_url);
    } catch (error) {
        console.error('Failed to update PR title:', error);
    }
}


async function updatePrDescription(octokit, owner, repo, pull_number, newDescription) {
    try {
        const response = await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number,
            body: newDescription
        });
        console.log('PR description updated:', response.data.html_url);
    } catch (error) {
        console.error('Failed to update PR description:', error);
    }
}

module.exports = {
    postCommentToPullRequest,
    createReviewComments,
    updatePrDescription,
    createConsolidatedReviewComment,
    fetchCommitsFromPullRequest,
    setupGitHubApp,
    updatePrTitle
};
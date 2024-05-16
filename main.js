require('dotenv').config();
const { setupExpressApp } = require('./appConfig');
const { setupGitHubApp } = require('./github');
const { Octokit } = require("@octokit/rest");
const { handleWebhookEvent } = require('./webhookHandlers');

async function main() {
    const app = setupExpressApp();
    const auth = await setupGitHubApp();

    app.post('/webhook', async (req, res) => {
        const octokit = new Octokit({ auth: (await auth({ type: "installation" })).token });
        await handleWebhookEvent(octokit, req.body);
        res.status(200).send('Webhook received');
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Server listening on port ${port}`));
}

main().catch(console.error);

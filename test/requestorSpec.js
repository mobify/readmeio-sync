'use strict';

var assert = require('chai').assert;
var nock = require('nock');
var js = require('jsonfile');
var fs = require('fs');

var UrlGenerator = require('../lib/urlGenerator');
var Requestor = require('../lib/requestor');
var Registry = require('../lib/registry');

var requestor;

var projectName = 'github-upload';
var resources = [{ version: 'v1.0'}, { version: 'v2.0' }];
var urlGen1 = new UrlGenerator(projectName, 'v1.0');
var urlGen2 = new UrlGenerator(projectName, 'v2.0');

describe('Requestor', function() {
    it('is constructed with resources + cookie', function() {
        requestor = new Requestor('cookie', projectName);

        assert.equal(requestor.projectName, projectName);
        assert.equal(requestor.cookie, 'cookie');
    });

    it('can request custom content', function(done) {
        requestor = new Requestor('cookie', projectName);

        nock(urlGen1.base()).get(urlGen1.contentPath()).reply(200, js.readFileSync('test/fixtures/content-v1.json'));
        nock(urlGen2.base()).get(urlGen2.contentPath()).reply(200, js.readFileSync('test/fixtures/content-v2.json'));

        requestor.customContent(resources, function(content) {
            assert.isDefined(content[projectName]['v1.0'].customContent.appearance.html_body);
            assert.isDefined(content[projectName]['v2.0'].customContent.appearance.stylesheet);

            done();
        });
    });

    it('can request documentation', function(done) {
        requestor = new Requestor('cookie', projectName);

        nock(urlGen1.base()).get(urlGen1.docsPath()).reply(200, js.readFileSync('test/fixtures/docs-v1.json'));
        nock(urlGen2.base()).get(urlGen2.docsPath()).reply(200, js.readFileSync('test/fixtures/docs-v2.json'));

        requestor.documentation(resources, function(documentation) {
            assert.isDefined(documentation[projectName]['v1.0'].documentation);
            assert.lengthOf(documentation[projectName]['v2.0'].documentation, 2);

            done();
        });
    });

    it('can request customPages', function(done) {
        requestor = new Requestor('cookie', projectName);

        nock(urlGen1.base()).get(urlGen1.pagesPath()).reply(200, js.readFileSync('test/fixtures/pages-v1.json'));
        nock(urlGen2.base()).get(urlGen2.pagesPath()).reply(200, js.readFileSync('test/fixtures/pages-v2.json'));

        requestor.customPages(resources, function(documentation) {
            assert.isDefined(documentation[projectName]['v1.0'].customPages);
            assert.lengthOf(documentation[projectName]['v2.0'].customPages, 2);

            done();
        });
    });

    it('caches request responses', function(done) {
        requestor = new Requestor('cookie', projectName);

        var scope = nock(urlGen1.base());
        scope.get(urlGen1.contentPath()).reply(200, js.readFileSync('test/fixtures/content-v1.json'));
        scope.get(urlGen2.contentPath()).reply(200, js.readFileSync('test/fixtures/content-v2.json'));

        scope.get(urlGen1.contentPath()).reply(200, '{ "github-upload": { "v1.0": { "customContent": "bleh" }}}');
        scope.get(urlGen2.contentPath()).reply(200, '{ "github-upload": { "v2.0": { "customContent": "bleh" }}}');

        requestor.customContent(resources, function(response1) {
            requestor.customContent(resources, function(response2) {
                assert.equal(JSON.stringify(response1), JSON.stringify(response2));

                nock.cleanAll();

                done();
            });
        });
    });

    it('can post/put new doc categories', function(done) {
        var registry = new Registry();
        registry.import(js.readFileSync('test/fixtures/syncRegistry.json'));

        // Create network request mocks
        var postResponse = js.readFileSync('test/fixtures/doc-category-post.json');
        var scope = nock(urlGen1.base());

        registry.allDocCategories().forEach(function(category) {
            var requestFn = category.slug ? 'put' : 'post';
            var urlFn = category.slug ? 'docCategoriesPutPath' : 'docCategoriesPostPath';
            var urlGen = category.version === 'v1.0' ? urlGen1 : urlGen2;

            scope[requestFn](urlGen[urlFn](category.slug), { title: category.title }).reply(200, postResponse);
        });

        // Make requests
        requestor = new Requestor('cookie', projectName);
        requestor.uploadDocCategories(registry.allDocCategories(), function(failedUploads) {
            assert.lengthOf(failedUploads, 0);

            registry.allDocCategories().forEach(function(category) {
                assert.equal(category.title, postResponse.title);
                assert.equal(category.slug, postResponse.slug);
            });
            done();
        });


    });

    it('can post/put new docs', function(done) {
        var registry = new Registry();
        registry.import(js.readFileSync('test/fixtures/syncRegistry.json'));

        // Create network request mocks
        var postResponse = js.readFileSync('test/fixtures/doc-post.json');
        var scope = nock(urlGen1.base());

        registry.allDocs().forEach(function(doc) {
            var requestFn = doc.slug ? 'put' : 'post';
            var urlFn = doc.slug ? 'docsPutPath' : 'docsPostPath';
            var urlGen = doc.version === 'v1.0' ? urlGen1 : urlGen2;
            var slug = doc.slug || doc.categorySlug;

            var requestBody = { title: doc.title, excerpt: doc.excerpt, body: fs.readFileSync(doc.body).toString(), type: doc.type };
            scope[requestFn](urlGen[urlFn](slug), requestBody).reply(200, postResponse);
        });

        // Make requests
        requestor.uploadDocs(registry.allDocs(), function(failedUploads) {
            assert.lengthOf(failedUploads, 0);

            registry.allDocs().forEach(function(doc) {
                assert.equal(doc.title, postResponse.title);
                assert.equal(doc.slug, postResponse.slug);
                assert.equal(doc.excerpt, postResponse.excerpt);
                assert.equal(fs.readFileSync(doc.body).toString(), postResponse.body);
            });

            assert.isTrue(scope.isDone());
            done();
        });
    });
});

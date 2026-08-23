#import <Foundation/Foundation.h>
#include <stdlib.h>
#include <string.h>

static NSMutableDictionary<NSString *, NSURL *> *qmActiveSecurityScopedURLs(void) {
    static NSMutableDictionary<NSString *, NSURL *> *activeURLs = nil;
    @synchronized ([NSProcessInfo class]) {
        if (activeURLs == nil) {
            activeURLs = [[NSMutableDictionary alloc] init];
        }
    }
    return activeURLs;
}

static char *qmCopyUTF8String(NSString *value) {
    if (value == nil) {
        return NULL;
    }
    const char *utf8 = [value UTF8String];
    return utf8 == NULL ? NULL : strdup(utf8);
}

char* qm_create_security_scoped_bookmark(const char* path, char** error_out) {
    @autoreleasepool {
        if (error_out != NULL) {
            *error_out = NULL;
        }
        if (path == NULL) {
            if (error_out != NULL) {
                *error_out = qmCopyUTF8String(@"The bookmark path is empty.");
            }
            return NULL;
        }
        NSString *pathString = [NSString stringWithUTF8String:path];
        NSURL *url = [NSURL fileURLWithPath:pathString];
        NSError *error = nil;
        NSData *bookmark = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
                         includingResourceValuesForKeys:nil
                                          relativeToURL:nil
                                                  error:&error];
        if (bookmark == nil) {
            if (error_out != NULL) {
                *error_out = qmCopyUTF8String(error.localizedDescription ?: @"Unable to create the bookmark.");
            }
            return NULL;
        }
        return qmCopyUTF8String([bookmark base64EncodedStringWithOptions:0]);
    }
}

char* qm_start_accessing_security_scoped_bookmark(const char* bookmark_base64, char** resolved_path_out, int* stale_out, char** error_out) {
    @autoreleasepool {
        if (resolved_path_out != NULL) {
            *resolved_path_out = NULL;
        }
        if (stale_out != NULL) {
            *stale_out = 0;
        }
        if (error_out != NULL) {
            *error_out = NULL;
        }
        if (bookmark_base64 == NULL) {
            if (error_out != NULL) {
                *error_out = qmCopyUTF8String(@"The bookmark data is empty.");
            }
            return NULL;
        }

        NSString *base64 = [NSString stringWithUTF8String:bookmark_base64];
        NSData *bookmark = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
        if (bookmark == nil) {
            if (error_out != NULL) {
                *error_out = qmCopyUTF8String(@"The bookmark data is invalid.");
            }
            return NULL;
        }

        BOOL stale = NO;
        NSError *error = nil;
        NSURL *url = [NSURL URLByResolvingBookmarkData:bookmark
                                               options:NSURLBookmarkResolutionWithSecurityScope
                                         relativeToURL:nil
                                   bookmarkDataIsStale:&stale
                                                 error:&error];
        if (url == nil) {
            if (error_out != NULL) {
                *error_out = qmCopyUTF8String(error.localizedDescription ?: @"Unable to resolve the bookmark.");
            }
            return NULL;
        }
        if (stale_out != NULL) {
            *stale_out = stale ? 1 : 0;
        }
        if (resolved_path_out != NULL) {
            *resolved_path_out = qmCopyUTF8String(url.path);
        }

        BOOL started = [url startAccessingSecurityScopedResource];
        if (!started) {
            // Unsandboxed builds may already have access and return NO here.
            // The Go caller still attempts the filesystem operation and uses
            // its real result to decide whether reauthorization is needed.
            return qmCopyUTF8String(@"");
        }

        NSString *token = [NSUUID UUID].UUIDString;
        @synchronized (qmActiveSecurityScopedURLs()) {
            qmActiveSecurityScopedURLs()[token] = url;
        }
        return qmCopyUTF8String(token);
    }
}

void qm_stop_accessing_security_scoped_bookmark(const char* token) {
    @autoreleasepool {
        if (token == NULL) {
            return;
        }
        NSString *tokenString = [NSString stringWithUTF8String:token];
        @synchronized (qmActiveSecurityScopedURLs()) {
            NSURL *url = qmActiveSecurityScopedURLs()[tokenString];
            [url stopAccessingSecurityScopedResource];
            [qmActiveSecurityScopedURLs() removeObjectForKey:tokenString];
        }
    }
}

void qm_free_bookmark_string(char* value) {
    free(value);
}

package io.github.yyahz.umaseedsearcher;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public final class UpdateFileProvider extends ContentProvider {
    static final String FILE_NAME = "uma-seed-searcher-update.apk";
    static final String CONTENT_PATH = "/update.apk";

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        requireUpdatePath(uri);
        return "application/vnd.android.package-archive";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        requireUpdatePath(uri);
        if (!"r".equals(mode)) throw new FileNotFoundException("Read-only update file");
        File file = new File(getContext().getCacheDir(), FILE_NAME);
        if (!file.isFile()) throw new FileNotFoundException("Update file is unavailable");
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        requireUpdatePath(uri);
        File file = new File(getContext().getCacheDir(), FILE_NAME);
        MatrixCursor cursor = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        cursor.addRow(new Object[] { FILE_NAME, file.isFile() ? file.length() : 0L });
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Read-only provider");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only provider");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only provider");
    }

    private void requireUpdatePath(Uri uri) {
        if (uri == null || !CONTENT_PATH.equals(uri.getPath())) {
            throw new IllegalArgumentException("Unsupported update URI");
        }
    }
}

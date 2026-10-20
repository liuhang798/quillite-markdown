package main

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"testing"
)

func TestPicGoMultipartBodyPreservesPayloadAndLength(t *testing.T) {
	for _, size := range []int{0, 1024, 25 * 1024 * 1024} {
		data := bytes.Repeat([]byte{0x5a}, size)
		body, sizeOnWire, contentType, err := picGoMultipartBody("图片.png", data, "image/png")
		if err != nil {
			t.Fatal(err)
		}
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			t.Fatal(err)
		}
		limited := &io.LimitedReader{R: body, N: sizeOnWire}
		reader := multipart.NewReader(limited, params["boundary"])
		part, err := reader.NextPart()
		if err != nil {
			t.Fatal(err)
		}
		if part.FormName() != "files" || part.FileName() != "图片.png" || part.Header.Get("Content-Type") != "image/png" {
			t.Fatalf("invalid MIME headers: %v", part.Header)
		}
		got, err := io.ReadAll(part)
		if err != nil || !bytes.Equal(got, data) {
			t.Fatalf("payload changed: %v", err)
		}
		if _, err := reader.NextPart(); err != io.EOF {
			t.Fatalf("unexpected extra part: %v", err)
		}
		if limited.N != 0 {
			t.Fatalf("incorrect content length: %d remaining", limited.N)
		}
		if extra, _ := io.ReadAll(body); len(extra) != 0 {
			t.Fatal("content length omitted bytes")
		}
	}
}

func BenchmarkPicGoMultipartBody(b *testing.B) {
	data := make([]byte, 25*1024*1024)
	for _, mode := range []string{"buffered-baseline", "shared-payload"} {
		b.Run(mode, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(data)))
			for i := 0; i < b.N; i++ {
				var body io.Reader
				if mode == "buffered-baseline" {
					var buffer bytes.Buffer
					writer := multipart.NewWriter(&buffer)
					part, err := writer.CreatePart(map[string][]string{
						"Content-Disposition": {`form-data; name="files"; filename="image.png"`},
						"Content-Type":        {"image/png"},
					})
					if err != nil {
						b.Fatal(err)
					}
					if _, err := part.Write(data); err != nil {
						b.Fatal(err)
					}
					if err := writer.Close(); err != nil {
						b.Fatal(err)
					}
					body = bytes.NewReader(buffer.Bytes())
				} else {
					var err error
					body, _, _, err = picGoMultipartBody("image.png", data, "image/png")
					if err != nil {
						b.Fatal(err)
					}
				}
				if _, err := io.Copy(io.Discard, body); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

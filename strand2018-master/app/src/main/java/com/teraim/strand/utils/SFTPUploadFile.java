package com.teraim.strand.utils;

public class SFTPUploadFile {
    public String localFilePath;
    public String fileName;
    public String remoteFolder;
    Long timestamp;
    public SFTPUploadFile(String p,String f, String r, Long timestamp){
        this.localFilePath=p;
        this.fileName =f;
        this.remoteFolder=r;
        this.timestamp = timestamp;
    }

}

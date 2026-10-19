package com.aveniq.kitchen.printing;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Private no-backup AES-GCM storage. The staff JWT is never passed to this store. */
public final class DeviceStore {
 private final AtomicFile file;private final String name;
 public DeviceStore(Context context,String name){if(!name.matches("[a-zA-Z0-9-]{1,100}"))throw new IllegalArgumentException("STORE_NAME");this.name=name;file=new AtomicFile(new File(context.getNoBackupFilesDir(),"kp-"+name+".bin"));}
 private SecretKey key(boolean create) throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);String alias="com.aveniq.kitchen."+name;if(store.containsAlias(alias))return (SecretKey)store.getKey(alias,null);if(!create)throw new IOException("CREDENTIAL_KEY_UNAVAILABLE");KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).setRandomizedEncryptionRequired(true).build());return generator.generateKey();}
 public synchronized JSONObject read() throws IOException {
  byte[] encoded;try(FileInputStream input=file.openRead();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1){if(bytes.size()+n>65536)throw new IOException("CREDENTIAL_STORE_CORRUPT");bytes.write(buffer,0,n);}encoded=bytes.toByteArray();}catch(FileNotFoundException missing){return null;}
  try{if(encoded.length<30||encoded[0]!=1||encoded[1]!=12)throw new IOException("CREDENTIAL_STORE_CORRUPT");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,encoded,2,12));cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));return new JSONObject(new String(cipher.doFinal(encoded,14,encoded.length-14),StandardCharsets.UTF_8));}catch(Exception error){throw new IOException("CREDENTIAL_STORE_CORRUPT",error);}
 }
 public synchronized void write(JSONObject value) throws IOException {
  FileOutputStream output=null;try{byte[] clear=value.toString().getBytes(StandardCharsets.UTF_8);if(clear.length>60000)throw new IOException("CREDENTIAL_STORE_TOO_LARGE");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(true));cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));byte[] iv=cipher.getIV();if(iv.length!=12)throw new IOException("CREDENTIAL_IV");byte[] encrypted=cipher.doFinal(clear);output=file.startWrite();output.write(new byte[]{1,12});output.write(iv);output.write(encrypted);output.getFD().sync();file.finishWrite(output);output=null;}catch(Exception error){if(output!=null)file.failWrite(output);throw new IOException("CREDENTIAL_STORE_WRITE_FAILED",error);}
 }
 public synchronized void clear(){file.delete();}
}
